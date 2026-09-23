const bootstrapModule = /^\/admin(?:\/|$)/.test(window.location.pathname)
  ? import('./admin-bootstrap')
  : /^\/app(?:\/|$)/.test(window.location.pathname)
    ? import('./legacy-bootstrap')
    : import('./landing-bootstrap');

void bootstrapModule.then(({ bootstrap }) => bootstrap()).catch((error: unknown) => {
  console.error('Unable to start the application', error);
  const root = document.getElementById('root');
  if (root) {
    root.setAttribute('role', 'alert');
    root.textContent = '화면을 불러오지 못했습니다. 새로고침 후 다시 이용해주세요.';
  }
});
