const signupForm = document.getElementById('signupForm');
const signinForm = document.getElementById('signinForm');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('signupMsg');
  msg.textContent = 'Đang tạo tài khoản...';
  msg.className = 'text-xs text-slate-500';

  const username = e.target.username.value.trim();
  const email = e.target.email.value.trim();
  const password = e.target.password.value;

  const { data, error } = await window.sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        username
      }
    }
  });

  if (error) {
    msg.textContent = error.message || 'Đăng ký thất bại';
    msg.className = 'text-xs text-red-500';
    return;
  }

  if (data.session) {
    msg.textContent = 'Đăng ký thành công. Bạn có thể đăng nhập ngay.';
  } else {
    msg.textContent = 'Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản.';
  }

  msg.className = 'text-xs text-green-600';
  e.target.reset();

  setTimeout(() => {
    const signinBtn = document.querySelector('[data-tab="signin"]');
    if (signinBtn) signinBtn.click();
  }, 600);
});

signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('signinMsg');
  msg.textContent = 'Đang đăng nhập...';
  msg.className = 'text-xs text-slate-500';

  const email = e.target.email.value.trim();
  const password = e.target.password.value;

  const { data, error } = await window.sb.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    msg.textContent = error.message || 'Đăng nhập thất bại';
    msg.className = 'text-xs text-red-500';
    return;
  }

  msg.textContent = 'Đăng nhập thành công. Đang chuyển...';
  msg.className = 'text-xs text-green-600';

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 700);
});
