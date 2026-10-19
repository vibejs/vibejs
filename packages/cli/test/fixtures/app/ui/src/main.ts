const res = await fetch('/api/health');
document.body.textContent = await res.text();

const flags = new URLSearchParams(location.search);
if (flags.has('error')) console.error('fixture');
if (flags.has('reject')) void Promise.reject(new Error('fixture rejection'));
