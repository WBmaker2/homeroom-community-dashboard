# Firebase Auth 기반 교사 권한 분리 설계 (Task 1)

## 배경

현재 단계의 클라우드 참여 동기화는 `activity code`(초대 코드)와 문서 스키마 검증만으로 접근을 허용합니다. 따라서 참여 코드를 알면:

- 활동 스냅샷을 조회해 학생 화면에서 과제 코드를 찾고,
- 제출을 업로드하거나 삭제할 수 있으며,
- 현재는 교사 본인 판단과 무관하게 같은 코드가 여러 선생님의 브라우저에서 충돌할 수 있습니다.

이 방식은 단일 교사 MVP에서는 동작했지만, 다수의 담임이 같은 프로젝트를 사용할 때는 활동/제출 데이터의 소유권 구분이 불충분합니다.

이 문서는 `학생 참여 클라우드 동기화` 다음 단계로, 교사 권한 분리를 위한 인증 기반 설계입니다.

참고: [학생 참여 클라우드 동기화 설계](./2026-05-05-cloud-participation-sync-design.md)

## 목표

1. 교사 email/password 로그인 적용  
   Firebase Auth를 통해 담임 교사 계정 기반으로 로그인/로그아웃 동작을 지원합니다.

2. 활동 게시 소유권 강화  
   교사가 클라우드에 게시한 활동 문서는 게시자(`teacherUid`)만 수정/삭제할 수 있도록 제한합니다.

3. 교사 전용 목록/삭제 권한 분리  
   활동 운영 화면에서의 클라우드 제출 목록 조회 및 제출 삭제는 교사 인증이 있는 요청에서만 허용합니다.

4. 학생은 비로그인 흐름 유지  
   학생 참여(`submit`, 코드 조회)는 기존처럼 인증 없이 진행합니다.

## 비목표

- 다중 기기 교사 실시간 동기화(동시 편집 충돌 해결 포함)
- 학부모/학생 계정 체계
- 관리자 콘솔/사이트 관리자 역할
- 유료 과금형 Auth 기능 또는 사용자별 과금 정산
- 학생 인증 기반 제출(현재는 코드/명부 기반 비로그인 제출 유지)

## Firebase 구성

### 프로젝트 기본값

- Firebase 프로젝트: `homeroom-dash-wbmaker2`
- Firestore DB: `(default)`
- 기존 정적 배포 구조 유지 (`Vite` + REST API 호출)

### 필수 활성화

- Firebase Auth → Identity Toolkit API/SDK 사용
- `Email/Password` 로그인 방식 사용 허용

### 설정값 운영

환경변수는 기존과 동일하게 빌드 시 주입:

- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PARTICIPATION_COLLECTION` (기본값 `homeroomPublicActivities`)

**주의:** Web API Key는 절대 저장소에 커밋하지 않습니다.  
GitHub Variables 또는 배포 환경 변수로만 주입합니다.

## 데이터 모델 변경

### CloudActivitySnapshot 변경

`homeroomPublicActivities/{activityCode}` 문서에 다음 필드를 추가합니다.

- `teacherUid` (필수, 새로 게시되는 문서): Firestore `request.auth.uid`
- `teacherEmail` (선택): 디버깅/운영 조회 보조값

기존 필드(`teacherId`, `code`, `classId`, `activityId`, `payload` 등)는 기존 방식 유지.  
`payload`는 기존 JSON 구조를 유지해 기존 파서 범위를 최소화합니다.

### 문서 구조 (요약)

```
homeroomPublicActivities/{code}
  app
  schemaVersion
  code
  teacherId
  teacherUid
  teacherEmail (선택)
  classId
  activityId
  publishedAt
  updatedAt
  payload(JSON)

homeroomPublicActivities/{code}/submissions/{submissionId}
  app
  schemaVersion
  classId
  activityId
  studentId
  participationKey
  submittedAt
  payload(JSON)
```

### 쓰기 조건

- 활동 문서 생성/수정/삭제는 `teacherUid`(인증 UID) 기반으로 소유자 확인 후 허용.
- 제출 문서는 기존대로 학생이 익명으로 생성 가능 (`create`는 비인증 허용)하되, 문서 read/delete는 교사 소유권을 만족해야 함.

## 보안 규칙 전략

### 핵심 규칙

- 활동 조회: 코드로 공개 조회(학생/교사 모두)
- 활동 생성/수정/삭제: `request.auth.uid == resource|request.resource.teacherUid`
- 제출 생성: 인증 비필수, 기존 스키마 검증 유지(앱 식별자, schemaVersion 등)
- 제출 조회/삭제: 부모 활동의 `teacherUid == request.auth.uid`일 때만 허용

### 규칙 개념 예시

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isHomeroomApp(v) {
      return v.app == "homeroom-community-dashboard" && v.schemaVersion == 1;
    }

    function teacherAuthMatch(teacherUid) {
      return request.auth != null && request.auth.uid == teacherUid;
    }

    function isParentActivityOwner(code) {
      let parent = get(/databases/$(database)/documents/homeroomPublicActivities/$(code));
      return parent.data.teacherUid is string
        && request.auth != null
        && request.auth.uid == parent.data.teacherUid;
    }

    function isSubmissionCreate() {
      return isHomeroomApp(request.resource.data)
        && request.resource.data.classId is string
        && request.resource.data.activityId is string
        && request.resource.data.studentId is string
        && request.resource.data.participationKey is string
        && request.resource.data.payload is string;
    }

    match /homeroomPublicActivities/{code} {
      allow read: if isHomeroomApp(resource.data);

      allow create: if isHomeroomApp(request.resource.data)
        && request.resource.data.teacherUid is string
        && request.resource.data.teacherUid == request.auth.uid;

      allow update: if teacherAuthMatch(resource.data.teacherUid)
        && isHomeroomApp(request.resource.data)
        && request.resource.data.teacherUid == resource.data.teacherUid;

      allow delete: if teacherAuthMatch(resource.data.teacherUid);

      match /submissions/{submissionId} {
        allow create: if isSubmissionCreate();
        allow read, delete: if isParentActivityOwner(code);
        allow update: if false;
      }
    }
  }
}
```

### 보안 포인트

- 읽기 허용이 유지되는 활동 조회는 학생 참여 측면을 위해 필요.
- 제출 목록 조회를 교사로 제한해 학생이 다른 제출 내용(익명/비익명)을 조회하지 못하게 함.
- `delete`는 무조건 `false`가 아니라 교사 소유자로 제한하여 운영에서 실질 삭제가 가능해야 함.

## 클라이언트 아키텍처 (REST 전용)

### 서비스 분리

기존 Firestore REST 호출을 유지하고, Firebase SDK를 추가하지 않습니다.

#### 1) Auth REST 서비스 (신규)

- 엔드포인트  
  `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=VITE_FIREBASE_API_KEY`
- 요청 본문  
  `{ email, password, returnSecureToken: true }`
- 응답에서 저장할 항목
  - `localId` → `teacherUid`
  - `idToken` (Bearer)
  - `refreshToken`
  - `email`
  - 만료시각(`expiresIn`)

#### 2) 세션 관리

- `localStorage` 키(예시): `homeroom-community-dashboard:teacher-session:v1`
- 저장 항목: `{ uid, email, idToken, refreshToken, expiresAt }`
- 앱 시작 시 세션 복원, 만료 시 재로그인 요구
- 세션 파기는 `session signOut`으로 localStorage 제거

#### 3) 요청 라우팅

- 교사 클라우드 쓰기/읽기/삭제 API는 `Authorization: Bearer ${idToken}` 헤더 사용
- 학생 참가/조회 API는 헤더 없이 기존대로 유지
- 공통 공통: 기존 `getCloudParticipationConfig` 및 `FIRESTORE_BASE_URL` 사용 패턴 유지

## 교사 UX 설계

### 기존 PIN 유지

- 현재 `교사용 잠금(로컬 PIN)`은 단말기 접근 제어로 유지
- PIN은 화면 보호/우발적 진입 차단 용도로 계속 유지

### Cloud 동기화 패널 동작

- 교사 패널에서 클라우드 동기화 기능 진입 시 로그인 상태가 없으면 `로그인 필요`로 가로막고,
  로그인 모달 또는 인라인 폼을 표시
- 로그인 성공 후
  - 로그인 이메일 표시
  - 현재 세션 만료 잔여시간/상태 메시지 표시
  - `로그아웃` 버튼 노출

### 활동 게시 흐름 변경

- 활동 게시 버튼/클라우드 반영 동작 직전에 인증 확인
- 미인증 시 게시 금지(에러 메시지: `교사 로그인 후 게시 가능합니다.`)

### 제출 조회/삭제 흐름

- 제출 목록 조회 및 삭제 버튼은 로그인 필요 시에만 활성화
- 각 동작 전 토큰 유효성 검사 후 401/403 시 재로그인 유도

## 마이그레이션 및 호환성

- 기존 로컬 `localStorage` 데이터는 유지되고 변경하지 않음.
- 기존에 이미 공개 게시된 활동 중 `teacherUid` 미기록 문서는:
  - 학생 참여 조회/제출에는 영향이 없음(활동 조회는 공개).
  - 교사 운영 패널에서의 제출 목록 조회·삭제는 동작이 제한될 수 있으므로, 운영자가 재게시 권장.
- 점진 적용 전략:
  1. 기존 활동은 읽기/학생 제출은 유지
  2. 기존 문서에는 `teacherUid`가 없으면 교사가 로그인 후 “재게시” 버튼으로 소유권을 부여
  3. 신규 게시물부터 `teacherUid` 필수로 기록

## 테스트/검증 체크리스트

1. Firebase Auth 로그인
  - 유효한 교사 계정으로 로그인 성공
  - 실패 계정/비밀번호 시 에러 메시지 표시
  - 토큰이 localStorage에만 저장되고 서버/코드 상수에는 노출되지 않음

2. 활동 권한
  - 교사 인증 없는 교사 화면에서 게시/수정/삭제 시도 → 401/403 처리
  - 인증 사용자 A가 게시한 활동은 사용자 A만 업데이트/삭제 가능
  - 사용자 B가 게시 삭제/수정 시도 → 실패

3. 제출 권한
  - 학생은 인증 없이 제출 생성 가능
  - 학생이 제출 목록을 조회해도 내역 노출되지 않음
  - 교사 로그인 후 본인 활동의 제출 목록 조회 성공
  - 교사 로그인 후 본인 활동의 제출 삭제 성공
  - 다른 교사 UID 활동 제출 목록/삭제 접근 실패

4. 기존 동선 보존
  - 로컬 저장/복원, 학생 `/student`, `/join/:code` 동작 유지
  - 클라우드 참여 동기화가 활성일 때도 비로그인 학생 제출 흐름은 기존과 동일

5. 보안 규칙 검증
  - Firestore rules 테스트(또는 수동 요청)로 `read/create/update/delete` 경로별 분기 확인
  - `teacherUid` 누락 활동문서, 잘못된 타입 필드로 쓰기 시 차단

## 구현용 산출물 (Task 1 범위)

- 문서 반영: `docs/2026-05-05-firebase-auth-permissions-design.md` (본 문서)
- 다음 단계 구현에서 참고:
  - `src/services/cloudParticipationClient.ts` 인증 헤더 적용
  - CloudActivitySnapshot 생성/파싱에 `teacherUid`/`teacherEmail` 반영
  - `firestore.rules` 업데이트
  - 교사 클라우드 패널 로그인 상태 UI/가드
