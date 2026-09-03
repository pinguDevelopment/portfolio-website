const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function initParticles() {
  const count = Math.min(70, Math.floor((canvas.width * canvas.height) / 22000));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: Math.random() * 1.4 + 0.4,
  }));
}
initParticles();

function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';

  for (const p of particles) {
    if (!prefersReducedMotion) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i], b = particles[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < 110) {
        ctx.strokeStyle = `rgba(88, 101, 242, ${0.5 - dist / 220})`;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
}

function loop() {
  drawFrame();
  if (!prefersReducedMotion) requestAnimationFrame(loop);
}
if (prefersReducedMotion) { drawFrame(); } else { loop(); }

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
navToggle?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
navLinks?.querySelectorAll('a').forEach((link) =>
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle?.setAttribute('aria-expanded', 'false');
  })
);

function typeText(el, text, speed = 35) {
  if (!el) return;
  if (prefersReducedMotion) {
    el.textContent = text;
    return;
  }
  let i = 0;
  el.textContent = '';
  const tick = () => {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
      setTimeout(tick, speed);
    }
  };
  tick();
}
typeText(document.getElementById('typed-output'), 'dein-name — Backend & Discord-Bot Developer, Karlsruhe');

async function loadDiscordSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    const data = await res.json();
    const area = document.getElementById('discord-auth-area');

    if (data.user) {
      area.innerHTML = `
        <div class="user-chip">
          <img src="${data.user.avatarUrl}" alt="Discord-Avatar von ${data.user.username}" />
          <span>${data.user.username}</span>
          <button id="logout-btn" type="button">Abmelden</button>
        </div>`;
      document.getElementById('logout-btn').addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.reload();
      });
    } else {
      document.getElementById('discord-login-btn')?.addEventListener('click', () => {
        window.location.href = '/auth/discord/login';
      });
    }
  } catch (e) {
    console.error('Session konnte nicht geladen werden', e);
  }
}
loadDiscordSession();

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
