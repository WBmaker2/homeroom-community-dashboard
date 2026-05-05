# 학생 참여 클라우드 동기화 설계

## 배경

현재 앱은 교사용 데이터와 학생 제출을 모두 브라우저 `localStorage`에 저장한다. 이 구조는 교사 한 명이 같은 브라우저에서 시연하거나 혼자 기록을 관리할 때는 충분하지만, 실제 수업에서 학생이 각자 기기로 `/join/:code` 링크를 열면 교사 브라우저에 있는 활동과 명부 데이터를 바로 읽을 수 없다.

이번 단계는 전체 앱 데이터를 클라우드로 이전하지 않고, 학생 참여에 필요한 공개 활동 데이터와 학생 제출만 클라우드로 동기화한다. 교사용 원본 데이터, 좌석 조건, 백업 파일, 교사 전용 메모는 기존 로컬 저장 구조를 유지한다.

## 목표

- 교사가 선택한 참여 활동을 클라우드에 게시한다.
- 학생은 다른 기기에서도 `/join/:code` 또는 `/student`에서 참여 코드를 입력해 활동을 찾는다.
- 학생 제출은 클라우드에 저장된다.
- 교사는 활동 운영 화면에서 클라우드 제출을 불러와 로컬 기록에 반영한다.
- 클라우드 설정이 없으면 기존 로컬 앱처럼 정상 동작한다.

## 비목표

- 교사용 전체 데이터의 실시간 공동 편집
- 강한 교사 인증과 사용자 계정 체계
- 좌석 배치, 교사 전용 칭찬 메모, 백업 파일의 클라우드 저장
- 학생별 영구 계정 생성
- 백업 파일과 클라우드 데이터의 자동 병합

## 권장 인프라

GitHub Pages에서 동작하는 정적 앱이므로 별도 서버 없이 Firebase Firestore REST API를 사용한다.

필요 환경변수:

```text
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PARTICIPATION_COLLECTION=homeroomPublicActivities
```

`VITE_FIREBASE_PARTICIPATION_COLLECTION`은 생략하면 `homeroomPublicActivities`를 기본값으로 사용한다.

## 운영 Firebase 설정

2026년 5월 5일 기준 운영용 Firebase 설정은 다음과 같다.

- Firebase 프로젝트 ID: `homeroom-dash-wbmaker2`
- Firestore 데이터베이스: `(default)`
- Firestore 리전: `asia-northeast3`
- 보안 규칙 파일: `firestore.rules`
- GitHub Pages 빌드 환경변수: GitHub Repository Variables에 등록한다.

Firebase Web API Key는 클라이언트 번들에 포함되는 공개 설정값이지만, 저장소에는 직접 커밋하지 않고 GitHub Actions 변수로만 주입한다.

## 데이터 모델

Firestore 컬렉션:

```text
homeroomPublicActivities/{activityCode}
homeroomPublicActivities/{activityCode}/submissions/{submissionDocumentId}
```

활동 문서의 주요 필드:

- `app`: `homeroom-community-dashboard`
- `schemaVersion`: `1`
- `code`: 활동 코드
- `teacherId`: 교사 브라우저별 식별자
- `classId`: 학급 ID
- `activityId`: 활동 ID
- `publishedAt`: 게시 시각
- `payload`: JSON 문자열

`payload`에는 학생 참여에 필요한 최소 데이터만 담는다.

- 학급 ID, 학급명, 운영/보관 상태
- 학생 `studentId`, 번호, 표시명
- 참여 활동 전체 필드
- 규칙 투표 활동이면 후보 제목, 설명, 상태, 현재 투표 수

학생 제출 문서의 주요 필드:

- `app`
- `schemaVersion`
- `classId`
- `activityId`
- `studentId`
- `participationKey`
- `submittedAt`
- `payload`: JSON 문자열

1회 제한 활동은 `participationKey`를 제출 문서 ID로 사용한다. 여러 번 제출 가능한 활동은 `submissionId`를 문서 ID로 사용한다.

## 교사용 흐름

활동 운영 화면에 `클라우드 참여 동기화` 패널을 추가한다.

1. 교사가 활동 목록에서 활동을 선택한다.
2. `선택 활동 게시`를 누르면 해당 활동의 공개 참여 스냅샷을 Firestore에 저장한다.
3. 학생에게 활동별 링크를 공유한다.
4. 수업 중 또는 수업 후 `제출 불러오기`를 누르면 클라우드 제출을 가져온다.
5. 새 제출만 로컬 제출 목록에 병합한다.
6. 안건 제출, 칭찬 제보, 규칙 투표 제출은 기존 교사용 로컬 기록에도 반영한다.
7. 교사가 제출을 삭제하면 로컬 기록을 삭제하고, 클라우드 설정이 있으면 해당 클라우드 제출 문서도 삭제한다.

## 학생용 흐름

1. 학생이 `/join/:code` 링크로 들어오거나 `/student`에서 참여 코드를 입력한다.
2. 현재 브라우저의 로컬 데이터에 활동이 없으면 클라우드에서 활동 코드를 조회한다.
3. 조회된 공개 스냅샷의 학생 번호 명단으로 학급 번호를 검증한다.
4. 활동 상태, 시작/마감 시각, 보관 학급 여부를 기존 규칙대로 확인한다.
5. 제출이 가능하면 Firestore 제출 문서로 저장한다.
6. 제출 성공 후 학생 화면의 내 참여 기록에 바로 반영한다.

## 개인정보 최소화

학생 화면과 클라우드 공개 활동에는 다음만 포함한다.

- 학급명
- 학생 번호
- 학생 표시명
- 활동 제목과 참여 설정
- 규칙 투표 대상의 제목/설명

다음은 클라우드 공개 활동에 포함하지 않는다.

- 학생 실명 원본과 지원 메모
- 좌석 배치와 자리 조건
- 교사 전용 칭찬 기록
- 백업 데이터
- 교사용 설정/비밀번호

## 보안 규칙

초기 MVP는 익명 학생 참여를 허용하되, 문서 구조와 앱 식별자를 제한한다. 교사 인증이 아직 없으므로 활동 코드를 아는 사용자는 학생 제출을 읽거나 제출할 수 있다. 이 단계의 보호 범위는 `초대 코드 기반 접근 + 앱 식별자 + 스키마 버전 + 필수 필드 검증`이다.

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isHomeroomApp() {
      return request.resource.data.app == "homeroom-community-dashboard"
        && request.resource.data.schemaVersion == 1;
    }

    function isExistingHomeroomApp() {
      return resource.data.app == "homeroom-community-dashboard"
        && resource.data.schemaVersion == 1;
    }

    function isPublicActivityWrite(code) {
      return isHomeroomApp()
        && request.resource.data.code == code
        && request.resource.data.teacherId is string
        && request.resource.data.classId is string
        && request.resource.data.activityId is string
        && request.resource.data.payload is string;
    }

    function isSubmissionCreate() {
      return isHomeroomApp()
        && request.resource.data.classId is string
        && request.resource.data.activityId is string
        && request.resource.data.studentId is string
        && request.resource.data.participationKey is string
        && request.resource.data.payload is string;
    }

    function isExistingSubmission() {
      return resource.data.app == "homeroom-community-dashboard"
        && resource.data.schemaVersion == 1;
    }

    match /homeroomPublicActivities/{code} {
      allow read: if isExistingHomeroomApp();
      allow create, update: if isPublicActivityWrite(code);
      allow delete: if false;

      match /submissions/{submissionId} {
        allow read: if true;
        allow create: if isSubmissionCreate();
        allow update: if false;
        allow delete: if isExistingSubmission();
      }
    }
  }
}
```

다음 강화 단계에서는 교사용 게시/삭제를 Firebase Auth 또는 별도 관리 토큰으로 제한하고, 제출 목록 조회도 교사 권한으로 분리한다.

## 실패 처리

- Firebase 환경변수가 없으면 `로컬 모드`로 표시하고 클라우드 버튼을 비활성화한다.
- 활동 조회 실패 시 학생에게 `입력한 코드로 열린 활동을 찾을 수 없습니다.`를 유지한다.
- 제출 저장 실패 시 학생에게 `제출을 저장하지 못했습니다. 선생님께 다시 확인해 주세요.`라고 안내한다.
- 교사 제출 불러오기 실패 시 활동 운영 화면에 실패 메시지를 표시한다.

## 테스트 기준

- 공개 활동 스냅샷은 학생 이름 원본과 지원 메모를 제외한다.
- 1회 제한 활동의 클라우드 제출 문서 ID는 참여 키를 사용한다.
- 여러 번 제출 가능한 활동은 제출 ID를 문서 ID로 사용한다.
- 클라우드 제출 병합은 같은 제출을 중복으로 추가하지 않는다.
- 환경변수가 없으면 기존 로컬 학생 참여 테스트가 그대로 통과한다.
