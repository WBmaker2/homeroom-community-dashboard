# localStorage 저장 및 JSON 백업/가져오기 설계

참고 문서:

- `docs/2026-05-03-homeroom-community-dashboard-design.md`
- `docs/2026-05-03-class-settings-design.md`

## 목적

현재 앱은 React 메모리 상태로만 동작하므로 새로고침하면 학급, 학생, 자리 배치, 칭찬, 안건, 규칙, 참여 기록이 초기 샘플 상태로 돌아간다. 첫 저장 단계에서는 별도 서버 없이 브라우저 `localStorage`에 자동 저장하고, 교사가 필요할 때 전체 데이터를 JSON 파일로 내려받아 백업하거나 백업 파일에서 다시 가져올 수 있게 한다.

## 첫 구현 범위

### 포함

- 앱 상태를 `localStorage`에 자동 저장한다.
- 앱 시작 시 저장된 데이터가 있으면 샘플 데이터 대신 저장 데이터를 불러온다.
- 저장 데이터에 스키마 버전을 둔다.
- 저장 데이터가 깨졌거나 버전이 맞지 않으면 샘플 데이터로 안전하게 시작하고 안내 메시지를 보여준다.
- 교사용 `학급 설정` 화면에 `데이터 보관` 영역을 추가한다.
- `JSON 백업 다운로드` 버튼으로 전체 데이터 스냅샷을 `.json` 파일로 내려받는다.
- `JSON 백업 가져오기`로 이전에 내려받은 백업 파일을 검증하고 복원한다.
- 가져오기 전 백업 파일의 학급 수, 학생 수, 내보낸 시각을 미리 보여준다.
- 가져오기는 기존 데이터를 덮어쓰는 동작이므로 명시적 확인 체크 후에만 실행한다.
- 다운로드 파일명에 날짜를 포함한다.

### 제외

- 서버 저장
- 계정별 동기화
- 암호화 저장
- 자동 클라우드 백업

가져오기는 전체 데이터 교체 방식으로 시작한다. 일부 학급만 병합하거나 선택적으로 가져오는 기능은 충돌 처리 규칙이 더 필요하므로 이번 범위에서 제외한다.

## 저장 단위

화면에서 사용하는 `HomeroomState`는 현재 선택 학급 기준으로 `praiseRecords`, `agendaItems`, `activities` 등을 필터링해 내려준다. 따라서 이 객체를 그대로 저장하면 다른 학급 데이터가 누락될 수 있다.

저장에는 별도 전체 스냅샷 타입을 사용한다.

```ts
type HomeroomDataSnapshot = {
  homeroomClasses: HomeroomClass[];
  activeClassId: string;
  praiseRecords: PraiseRecord[];
  agendaItems: AgendaItem[];
  ruleCandidates: RuleCandidate[];
  classroomRules: ClassroomRule[];
  activities: ParticipationActivity[];
  submissions: ParticipationSubmission[];
  classSeatMaps: Record<string, SeatMap>;
  classSeatingConstraints: Record<string, SeatingConstraint[]>;
  classManualAssignments: Record<string, SeatAssignment[]>;
};
```

다음 값은 저장하지 않는다.

- `homeroomClass`: `activeClassId`로 계산 가능
- `signals`: 대시보드 파생값
- `seatingPlan`: 좌석 추천 파생값
- `todayIso`: 실행 시점 또는 앱 기준 날짜
- 현재 입력 중인 폼 값

## localStorage 구조

저장 키는 앱 이름과 버전을 포함한다.

```text
homeroom-community-dashboard:v1
```

저장 값은 메타데이터와 실제 데이터를 분리한다.

```json
{
  "app": "homeroom-community-dashboard",
  "schemaVersion": 1,
  "savedAt": "2026-05-03T15:00:00+09:00",
  "data": {
    "homeroomClasses": [],
    "activeClassId": "",
    "praiseRecords": [],
    "agendaItems": [],
    "ruleCandidates": [],
    "classroomRules": [],
    "activities": [],
    "submissions": [],
    "classSeatMaps": {},
    "classSeatingConstraints": {},
    "classManualAssignments": {}
  }
}
```

## 로드 정책

1. 앱 시작 시 `localStorage.getItem(STORAGE_KEY)`를 읽는다.
2. 값이 없으면 샘플 데이터로 시작한다.
3. JSON 파싱에 실패하면 샘플 데이터로 시작하고 `저장된 데이터를 읽을 수 없어 기본 데이터로 시작했습니다.`를 표시한다.
4. `app` 또는 `schemaVersion`이 맞지 않으면 샘플 데이터로 시작하고 `저장 데이터 버전이 맞지 않습니다.`를 표시한다.
5. 필수 배열과 맵 구조가 없으면 샘플 데이터로 시작한다.
6. `activeClassId`가 존재하지 않는 학급을 가리키면 첫 번째 학급으로 보정한다.
7. 학급이 0개면 샘플 학급 하나를 넣어 앱이 빈 상태로 깨지지 않게 한다.

## 저장 정책

- 상태가 바뀔 때마다 전체 스냅샷을 저장한다.
- 너무 잦은 저장을 피하기 위해 `useEffect` 안에서 짧은 debounce를 둔다. 예: 300ms.
- 저장 성공 시 마지막 저장 시각을 상태로 보관해 `학급 설정` 화면에 보여준다.
- 저장 실패 시 안내 메시지를 보여준다.

예외 상황:

- `localStorage` 사용 불가
- 저장 용량 초과
- JSON 직렬화 실패

이 경우 앱 사용은 계속 가능해야 하며, 교사에게 `이 브라우저에 자동 저장하지 못했습니다. JSON 백업을 내려받아 보관해 주세요.`라고 안내한다.

## JSON 백업 다운로드

백업 버튼은 `학급 설정` 화면의 `데이터 보관` 영역에 둔다.

동작:

1. 현재 전체 스냅샷을 만든다.
2. 백업 메타데이터를 붙인다.
3. 보기 좋게 `JSON.stringify(payload, null, 2)`로 직렬화한다.
4. `Blob`과 `URL.createObjectURL`로 다운로드 링크를 만든다.
5. 파일명을 날짜 기반으로 만든다.
6. 클릭 후 URL을 해제한다.

파일명:

```text
today-our-class-backup-2026-05-03.json
```

백업 파일 구조:

```json
{
  "app": "homeroom-community-dashboard",
  "schemaVersion": 1,
  "exportedAt": "2026-05-03T15:00:00+09:00",
  "data": {}
}
```

## JSON 백업 가져오기

가져오기 버튼은 다운로드 버튼과 같은 `데이터 보관` 영역에 둔다. 구현은 숨겨진 `<input type="file" accept="application/json,.json">`을 버튼으로 트리거하는 방식으로 시작한다.

동작:

1. 교사가 `JSON 백업 가져오기` 버튼을 누른다.
2. 파일 선택 창에서 `.json` 파일을 고른다.
3. `FileReader.readAsText`로 파일 내용을 읽는다.
4. JSON 파싱과 스키마 검증을 실행한다.
5. 검증에 성공하면 미리보기 상태를 표시한다.
6. 교사가 `현재 데이터를 백업 파일로 교체합니다` 확인 체크를 켠다.
7. `가져오기 실행` 버튼을 누르면 전체 스냅샷을 교체한다.
8. 교체 직후 `localStorage`에도 같은 스냅샷을 저장한다.
9. 선택 학급은 백업 안의 `activeClassId`로 전환하되, 유효하지 않으면 첫 학급으로 보정한다.

미리보기 표시 항목:

- 백업 파일명
- `exportedAt`
- 학급 수
- 전체 학생 수
- 칭찬 기록 수
- 회의 안건 수
- 규칙 후보 수
- 학급 약속 수
- 참여 활동 수

검증 실패 처리:

- JSON 파싱 실패: `JSON 파일을 읽을 수 없습니다.`
- 앱 식별자 불일치: `오늘 우리 반 백업 파일이 아닙니다.`
- 스키마 버전 불일치: `지원하지 않는 백업 버전입니다.`
- 필수 데이터 누락: `백업 데이터 구조가 올바르지 않습니다.`
- 학급이 0개: `백업 파일에 학급이 없습니다.`

가져오기 성공 후 안내:

```text
백업 데이터를 가져왔습니다. 이 브라우저 저장소도 함께 갱신했습니다.
```

가져오기 실패 시 기존 앱 상태는 그대로 유지한다. 파일 검증과 미리보기 단계에서는 어떤 앱 상태도 변경하지 않는다.

## 덮어쓰기 안전장치

백업 가져오기는 현재 브라우저의 전체 데이터를 교체한다. 실수로 기존 데이터를 잃지 않도록 다음 안전장치를 둔다.

- 가져오기 전 `먼저 현재 데이터를 JSON으로 백업해 주세요.` 문구를 보여준다.
- 미리보기 전에는 `가져오기 실행` 버튼을 표시하지 않는다.
- 미리보기 후에도 확인 체크가 켜져야 `가져오기 실행` 버튼이 활성화된다.
- 가져오기 성공 후에는 복원된 데이터가 자동 저장되며, 마지막 저장 시각도 갱신된다.
- 가져오기 실패 시에는 기존 상태와 `localStorage`를 변경하지 않는다.

## UI 설계

`학급 설정` 화면 하단에 `데이터 보관` 패널을 추가한다.

표시 항목:

- 자동 저장 상태
- 마지막 저장 시각
- 현재 저장된 학급 수
- 현재 저장된 학생 수
- JSON 백업 다운로드 버튼
- JSON 백업 가져오기 버튼
- 가져오기 파일 미리보기
- 가져오기 덮어쓰기 확인 체크박스
- 가져오기 실행 버튼

문구:

- 자동 저장 성공: `이 브라우저에 자동 저장 중입니다.`
- 저장 실패: `자동 저장에 실패했습니다. JSON 백업을 내려받아 보관해 주세요.`
- 백업 다운로드: `JSON 백업 다운로드`
- 백업 가져오기: `JSON 백업 가져오기`
- 가져오기 확인: `현재 데이터를 백업 파일로 교체합니다.`

학생 화면에는 저장/백업 UI를 노출하지 않는다.

## 파일 구조

```text
src/domain/persistence.ts
src/state/useHomeroomState.ts
src/features/teacher/views/SettingsView.tsx
src/test/persistence.test.ts
```

`persistence.ts` 책임:

- 저장 키와 스키마 버전 상수
- 전체 스냅샷 타입
- `createInitialSnapshot`
- `serializeSnapshot`
- `parseStoredSnapshot`
- `parseBackupFile`
- `validateSnapshotPayload`
- `summarizeSnapshot`
- `downloadJsonBackup`
- `getBackupFileName`

`useHomeroomState.ts` 책임:

- 초기 상태를 저장 스냅샷에서 만들기
- 전체 스냅샷 만들기
- 상태 변경 시 자동 저장
- 가져온 스냅샷으로 전체 상태 교체
- 저장 상태와 마지막 저장 시각 제공

`SettingsView.tsx` 책임:

- 저장 상태 표시
- JSON 백업 다운로드 버튼 제공
- JSON 백업 파일 선택 UI 제공
- 가져오기 미리보기와 확인 체크 제공
- 가져오기 실행 버튼 제공

## 검증 기준

- 학급을 새로 만들고 새로고침하면 새 학급이 유지된다.
- 학생을 추가하고 새로고침하면 학생 명부가 유지된다.
- 자리 배치 수동 변경 후 새로고침하면 변경이 유지된다.
- 저장 데이터가 깨져 있어도 앱이 흰 화면으로 죽지 않는다.
- JSON 백업 파일이 다운로드되고, 파일 안에 `app`, `schemaVersion`, `exportedAt`, `data`가 들어 있다.
- 다운로드한 JSON 백업 파일을 다시 가져오면 학급과 학생 데이터가 복원된다.
- 잘못된 JSON 파일을 가져오면 기존 데이터가 유지되고 오류 안내가 표시된다.
- 스키마 버전이 다른 백업 파일은 가져오기를 막는다.
- 가져오기 확인 체크 전에는 실행 버튼이 비활성화된다.
- 가져오기 성공 후 새로고침해도 가져온 데이터가 유지된다.
- 학생 화면에는 저장/백업 UI가 보이지 않는다.

## 향후 확장

- 자동 저장 데이터 초기화
- 학급 단위 선택 가져오기
- 기존 데이터와 백업 데이터 병합
- 백업 파일 암호화
- 서버 저장소 또는 계정 기반 동기화
