# 교사별 참여 코드 생성 구현 계획

## 확인 결과

현재 앱의 기본 참여 코드는 샘플 데이터에 들어 있는 `WARM-62` 고정값이다. 교사가 새로 여는 안건 제출 활동과 투표 활동은 `Date.now()`의 끝 4자리를 사용해 `AGENDA-1234`, `VOTE-1234`처럼 만든다.

이 방식은 다음 문제가 있다.

- 여러 선생님이 처음 앱을 열면 같은 샘플 코드로 시작한다.
- 시간 끝자리 기반 코드는 같은 시점에 만들면 충돌할 수 있다.
- 참여 코드에 어느 교사/브라우저에서 만든 코드인지 구분되는 정보가 없다.

## 목표

- 최초 실행 시 브라우저별 `teacherId`를 랜덤 생성한다.
- `teacherId`는 localStorage에 저장해 같은 선생님 브라우저에서는 유지한다.
- 모든 새 참여 코드는 `활동종류-교사세그먼트-랜덤세그먼트` 형식으로 만든다.
- 기본 샘플 참여 코드도 최초 실행 시 교사별 코드로 치환한다.
- 기존 백업 파일은 계속 가져올 수 있게 한다.

## 코드 형식

```txt
WARM-K7Q2-M9P4
AGENDA-K7Q2-R8TX
VOTE-K7Q2-F3PA
```

- 첫 부분: 활동 유형
- 가운데 부분: 교사 식별 세그먼트
- 마지막 부분: 랜덤 세그먼트

코드 문자는 혼동을 줄이기 위해 `0`, `1`, `I`, `O`를 제외한 대문자/숫자를 사용한다.

## 저장 키

```txt
homeroom-community-dashboard:teacher-id:v1
```

앱 데이터 백업에도 `teacherId`를 함께 넣는다. 기존 백업처럼 `teacherId`가 없는 데이터는 가져오기 시 현재 브라우저의 `teacherId`를 붙여서 보정한다.

## 구현 단위

### `src/domain/inviteCodes.ts`

- `createTeacherId`
- `getOrCreateTeacherId`
- `saveTeacherId`
- `createParticipationCode`
- `getTeacherCodeSegment`

### `src/state/useHomeroomState.ts`

- 앱 초기화 시 `teacherId` 확보
- 샘플 활동 코드를 교사별 코드로 치환
- snapshot 저장/백업에 `teacherId` 포함
- 백업 가져오기 시 `teacherId` 복원 또는 현재 값 유지

### 교사용 활동 생성 화면

- `AgendaView`의 `makeCode("AGENDA")` 제거
- `RulesView`의 `VOTE-${Date.now()...}` 제거
- `createParticipationCode`로 코드 생성
- 기존 활동 코드 목록을 넣어 로컬 충돌 방지

## 한계

현재 앱은 GitHub Pages와 localStorage 기반의 정적 앱이다. 따라서 선생님별 코드 생성은 같은 공개 URL을 쓰는 여러 선생님의 브라우저 데이터가 서로 섞이지 않도록 하는 로컬 식별 장치다.

학생 개인 기기에서 교사 브라우저의 활동 데이터를 실시간으로 조회하려면 서버 저장소와 인증이 필요하다. 이번 구현은 서버 없이 가능한 범위에서 교사별 코드 생성과 로컬 충돌 방지를 해결한다.

## 테스트

- 같은 랜덤 세그먼트를 써도 `teacherId`가 다르면 참여 코드가 다르다.
- 같은 교사 안에서 기존 코드와 충돌하면 다시 생성한다.
- 기본 샘플 활동 코드가 `WARM-62`로 남지 않는다.
- 안건/투표 활동 생성 코드가 `Date.now()` 끝자리 방식이 아니다.
