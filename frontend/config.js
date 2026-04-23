// Authentik OIDC 설정 — EC2 IP와 client_id를 실제 값으로 교체
window.APP_CONFIG = {
  OIDC_CLIENT_ID: 'YOUR_CLIENT_ID',
  AUTH_ENDPOINT:  'http://YOUR_EC2_IP:9000/application/o/msp-oncall/authorize/',
  TOKEN_ENDPOINT: 'http://YOUR_EC2_IP:9000/application/o/msp-oncall/token/',
};
