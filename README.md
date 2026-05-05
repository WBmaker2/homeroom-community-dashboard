# 오늘 우리 반

담임교사가 학급 운영 신호, 자리 배치, 칭찬 기록, 회의 안건, 규칙 합의, 학급 설정을 한곳에서 관리하고 학생은 참여 링크나 코드로 활동에 제출하는 교실용 웹앱입니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

## 주요 경로

- `/`: 교사용/학생용 진입 선택
- `/teacher`: 교사용 잠금 및 대시보드
- `/student`: 학생 참여 코드 입력
- `/join/WARM-K7Q2-M9P4`: 학생 참여 링크 예시

## 학생 참여 클라우드 동기화

Firebase Firestore REST 설정값이 있으면 교사가 활동 운영 화면에서 선택 활동을 게시하고, 학생은 다른 기기에서 참여 코드를 조회해 제출할 수 있습니다. 설정값이 없으면 기존 localStorage 기반 로컬 모드로 동작합니다.

```bash
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PARTICIPATION_COLLECTION=homeroomPublicActivities
```

## 배포

`main` 브랜치에 push하면 GitHub Actions가 테스트와 빌드를 실행한 뒤 GitHub Pages로 배포합니다.
