// Frontend demo only. Tab-scoped verifiers are NOT a trusted authentication boundary.
const KEY = 'hil.demo.accounts.v1';
const SESSION = 'hil.demo.session.v1';

function read(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function currentUser() {
  return read(SESSION, null);
}
export function logout() {
  sessionStorage.removeItem(SESSION);
}
export function enterDemo() {
  const user = { username: '探索者', demo: true };
  sessionStorage.setItem(SESSION, JSON.stringify(user));
  return user;
}

export async function authenticate({ username, password, confirm }, register) {
  username = username.trim();
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username))
    throw new Error('用户名需为 2–24 位文字、数字、下划线或短横线。');
  if (password.length < 8 || password.length > 128) throw new Error('演示密码长度应为 8–128 位。');
  if (register && password !== confirm) throw new Error('两次输入的密码不一致。');
  const accounts = read(KEY, []);
  const account = accounts.find(
    (a) => a.username.toLocaleLowerCase() === username.toLocaleLowerCase(),
  );
  if (register) {
    if (account) throw new Error('当前标签页中已存在该用户名，请直接登录。');
    const salt = crypto.randomUUID();
    accounts.push({ username, salt, verifier: await derive(password, salt) });
    sessionStorage.setItem(KEY, JSON.stringify(accounts));
  } else if (!account || (await derive(password, account.salt)) !== account.verifier) {
    throw new Error('用户名或密码不正确。你也可以先注册一个演示账户。');
  }
  const user = { username: account?.username ?? username, demo: false };
  sessionStorage.setItem(SESSION, JSON.stringify(user));
  return user;
}
