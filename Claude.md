# MSP 온콜 앱 — Claude Code 인수인계 문서

## 프로젝트 개요
MSP 팀(6명)이 50개 고객사의 AWS 인프라를 운영하면서
주말/야간 온콜 상황을 **스마트폰으로 처리**할 수 있게 만드는 PWA 앱.

기존에는 알람 울리면 노트북 열어야 했는데,
이 앱으로 폰에서 바로: 고객사 확인 → 담당자 전화 → AI 분석 → 메일/슬랙 발송까지 해결.

---

## 확정된 기술 스택

| 영역 | 기술 | 이유 |
|------|------|------|
| 인프라 | EC2 + Docker Compose | Private Subnet, 팀 정책상 managed DB 미사용 |
| 인증 | Authentik | Cognito 팀 정책 미승인, 오픈소스 MFA |
| 백엔드 | Node.js (ESM) + Express | 팀 선호 |
| DB | PostgreSQL 16 (Docker) | EC2 내부, EBS 암호화 볼륨 |
| 알람 수신 | Webhook (Whatap + Datadog) | 기존 슬랙 알람과 병렬 연결 |
| 메일 | AWS SES | 샌드박스로도 내부 발송 충분 |
| 슬랙 | Slack Bot API | 알람 채널에 대응 상황 스레드 공유 |
| AI | Anthropic Claude API | 알람 분석, 메일 초안 생성 |
| 프론트 | PWA (모바일 최적화) | 앱스토어 배포 없이 홈 화면 추가 |

---

## 현재 완성된 파일 구조

```
msp-oncall/
├── docker-compose.yml          ✅ 완성
├── .env.example                ✅ 완성
├── scripts/
│   └── backup.sh               ✅ 완성 (매일 새벽 3시 S3 백업)
├── docker/
│   └── nginx/
│       └── nginx.conf          ✅ 완성
└── backend/
    ├── Dockerfile              ✅ 완성
    ├── package.json            ✅ 완성
    └── src/
        ├── index.js            ✅ 완성 (Express 서버)
        ├── db/
        │   ├── pool.js         ✅ 완성
        │   └── init.sql        ✅ 완성
        ├── middleware/
        │   └── auth.js         ✅ 완성 (Authentik JWT 검증)
        └── routes/
            ├── webhook.js      ✅ 완성 (Whatap + Datadog 수신)
            ├── customers.js    ✅ 완성
            ├── alerts.js       ✅ 완성
            ├── ai.js           ✅ 완성 (분석 + 메일 + 슬랙)
            └── actions.js      ❌ 미완성 (감사로그 조회 API)
```

---

## 남은 작업

### 1순위 — actions.js (감사로그 조회 API)
```
GET /api/actions?limit=50
```
action_logs 테이블 조회. user_email, action, customer_id, created_at 반환.

### 2순위 — PWA 프론트엔드 (핵심)
모바일 최적화 PWA. 아래 화면 순서로 구현.

**화면 목록 (모바일 기준)**
1. **로그인** — Authentik OIDC 리다이렉트
2. **홈 / 알람 목록** — open 알람을 심각도순 정렬, 고객사명 표시, ACK 버튼
3. **고객사 목록** — 검색, 알람 배지 (critical/warning 카운트)
4. **고객사 상세** — 담당자 연락처 (전화번호 탭하면 바로 전화), 최근 30일 히스토리 타임라인
5. **AI 분석** — 알람 선택 → 분석 요청 → 결과 표시
6. **메일 발송** — 상황 입력 → AI 초안 생성 → 수신자 선택 → 발송
7. **슬랙 공유** — 메시지 입력 → 채널에 공유

**PWA 필수 파일**
- `manifest.json` — 홈 화면 아이콘, 앱 이름
- `sw.js` — Service Worker (오프라인 캐시는 최소한으로)
- 모바일 터치 최적화 (버튼 최소 48px, 탭 한 번으로 전화 연결)

---

## 보안 포인트 (건드리지 말 것)

- Webhook은 HMAC 서명 검증 필수 (`verifyWhatapSignature`, `verifyDatadogSignature`)
- 모든 `/api/*` 엔드포인트는 `authMiddleware` 통과 필수
- 담당자 연락처 조회 시 `action_logs` 에 반드시 기록
- DB 비밀번호, API 키는 절대 코드에 하드코딩 금지 → `.env`만 사용
- `internal` Docker 네트워크는 외부 노출 없음 유지

---

## DB 스키마 요약

```sql
customers     -- id, name, slug(프로젝트명 매핑용), tier, aws_account_id
contacts      -- id, customer_id, name, role, phone, email, is_primary
alerts        -- id, customer_id, source, severity, title, status, received_at
incidents     -- id, customer_id, alert_id, title, description, created_at
action_logs   -- id, user_email, action, customer_id, alert_id, created_at
```

---

## 알람 흐름

```
Whatap / Datadog
    ↓ POST /webhook/whatap  또는  /webhook/datadog
    ↓ HMAC 서명 검증
    ↓ project_name으로 customers.slug 매핑
    ↓ alerts 테이블 INSERT
    ↓ 앱 홈 화면에 실시간 표시
```

Whatap payload: `body.project_name`, `body.level`, `body.title`, `body.message`
Datadog payload: `body.tags[]` 에서 `project:` 태그 파싱, `body.alert_type`

---

## 로컬 개발 시작

```bash
cp .env.example .env
# .env 값 채우기

docker compose up -d postgres redis
cd backend && npm install && npm run dev
```

## 프로덕션 배포

```bash
# EC2 (Amazon Linux 2023 권장)
sudo yum install -y docker
sudo systemctl start docker
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# EBS 볼륨 마운트 (암호화 볼륨)
sudo mkdir -p /data/postgres
sudo mount /dev/xvdf /data/postgres

# 실행
docker compose up -d
```