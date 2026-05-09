/* marketing Module */
Modulos.marketing = {
  async render() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Módulo: marketing</h1>
      </div>
      <div class="page-body">
        <div class="alert alert-cyan">
          <div class="alert-icon">🔧</div>
          <div class="alert-body">Módulo <b>marketing</b> en construcción — disponible en la próxima actualización.</div>
        </div>
      </div>`;
  }
};
