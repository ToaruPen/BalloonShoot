import "./styles/app.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

appRoot.innerHTML = `
  <main class="app-shell">
    <h1>BalloonShoot PoC</h1>
    <p>Bootstrap complete</p>
  </main>
`;
