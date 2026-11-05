const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const forms = ['lead-assurances', 'lead-assurances-rcs', 'lead-energies', 'lead-energies-rcs'];

function openPage(name, response = { ok: true, sent: { chef: true, client: true } }) {
  const html = fs.readFileSync(path.join(__dirname, '..', name, 'index.html'), 'utf8');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    // jsdom ne prend pas en charge certaines règles CSS Elementor.
    if (error.type !== 'css parsing') { throw error; }
  });
  const dom = new JSDOM(html, { url: `https://www.hellodevis.fr/${name}/`, runScripts: 'outside-only', virtualConsole });
  const { window } = dom;
  const requests = [];
  window.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { status: 200, text: async () => JSON.stringify(response) };
  };
  const script = [...window.document.scripts].find(el => el.textContent.includes('function initForm(root)'));
  assert.ok(script, 'script du formulaire présent');
  window.eval(script.textContent);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { dom, window, document: window.document, requests };
}

function fillForm(document) {
  const form = document.querySelector('.hl-lf-form');
  for (const [name, value] of Object.entries({ nom: 'Jean Martin', email: 'jean@example.com', telephone: '0612345678', code_postal: '75001', societe: 'Exemple' })) {
    form.elements[name].value = value;
  }
}

for (const name of forms) {
  test(`${name} : liste, validation, navigation et envoi`, async () => {
    const { dom, window, document, requests } = openPage(name);
    try {
      const form = document.querySelector('.hl-lf-form');
      const steps = [...form.querySelectorAll('[data-hl-step]')];
      const trigger = form.querySelector('.hl-lf-select__trigger');
      const list = form.querySelector('.hl-lf-select__list');
      const next = form.querySelectorAll('[data-hl-next]');
      const label = document.querySelector('[data-hl-step-label]');
      const fill = document.querySelector('.hl-lf-progress__fill');
      const head = document.querySelector('.hl-lf-head');
      assert.equal(head.hidden, false);
      assert.equal(form.querySelector('.hl-lf-legend').textContent, 'Quels Leads souhaiteriez vous recevoir ?');
      assert.equal(form.dataset.hlReady, 'true');
      assert.equal(label.textContent, 'Étape 1 sur 3');
      assert.ok(Math.abs(parseFloat(fill.style.width) - 100 / 3) < 0.01);

      next[0].click();
      assert.equal(steps[0].hidden, false);
      assert.equal(trigger.getAttribute('aria-invalid'), 'true');
      trigger.click();
      assert.equal(list.hidden, false);
      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
      const option = list.querySelectorAll('[role="option"]')[1];
      option.click();
      assert.equal(form.elements.volume.value, option.dataset.value);
      assert.equal(list.hidden, true);
      assert.equal(trigger.getAttribute('aria-invalid'), 'false');
      next[0].click();
      assert.equal(steps[0].hidden, true);
      assert.equal(steps[1].hidden, false);
      assert.equal(label.textContent, 'Étape 2 sur 3');
      assert.ok(Math.abs(parseFloat(fill.style.width) - 200 / 3) < 0.01);
      next[1].click();
      assert.equal(steps[1].hidden, false);
      assert.equal(form.querySelector('#hl-lf-besoins-error').hidden, false);
      form.querySelector('input[name="besoins"]').click();
      next[1].click();
      assert.equal(steps[2].hidden, false);
      assert.equal(label.textContent, 'Étape 3 sur 3');
      form.querySelectorAll('[data-hl-back]')[1].click();
      assert.equal(steps[1].hidden, false);
      next[1].click();
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      assert.equal(form.querySelector('[data-hl-alert]').hidden, false);
      assert.equal(head.hidden, false);
      assert.equal(requests.length, 0);
      fillForm(document);
      const submitted = new Promise(resolve => document.addEventListener('hl:lead-form:submit', e => resolve(e.detail), { once: true }));
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      const data = await submitted;
      assert.equal(data.formulaire, name);
      assert.equal(data.volume, option.dataset.value);
      assert.equal(data.volume_souhaite, option.dataset.value);
      assert.equal(data.besoins.length, 1);
      assert.equal(requests.length, 2); // feuille et relais e-mail simulés
      const mail = requests.find(req => req.body.messages);
      const sheet = requests.find(req => req.body.lead);
      assert.equal(mail.body.messages.length, 3);
      const client = mail.body.messages[2];
      const sector = name.includes('assurances') ? 'Assurances pro' : 'Énergies pro';
      const receipt = `Merci de votre confiance. Votre demande de leads ${sector} a bien été enregistrée et a été transmise à notre équipe commerciale.`;
      assert.ok(client.html.includes('Bonjour, nous avons bien reçu votre demande.'));
      assert.ok(client.html.includes(receipt));
      assert.match(client.html, /contact@hellolead\.pro<\/a>\.<\/p>/);
      assert.ok(client.text.startsWith('Bonjour, nous avons bien reçu votre demande.\n\n'));
      assert.ok(client.text.includes(receipt));
      assert.ok(client.text.includes('Une question ? Répondez simplement à cet e-mail ou écrivez-nous à contact@hellolead.pro.'));
      assert.equal(client.reply_to, window.HL_LEAD_CONFIG.contactEmail);
      assert.equal(sheet.body.lead.volume, data.volume);
      assert.equal(form.querySelector('.hl-lf-success').hidden, false);
      assert.equal(head.hidden, true);
      assert.match(form.querySelector('[data-hl-success-email]').textContent, /jean@example\.com/);
      assert.equal(label.textContent, 'Demande envoyée');
      assert.equal(fill.style.width, '100%');
    } finally { dom.window.close(); }
  });


  test(`${name} : l'en-tête reste visible si l'envoi échoue`, async () => {
    const { dom, window, document } = openPage(name, { ok: false, error: 'unknown' });
    try {
      const form = document.querySelector('.hl-lf-form');
      form.querySelector('.hl-lf-select__trigger').click();
      form.querySelector('[role="option"]').click();
      form.querySelectorAll('[data-hl-next]')[0].click();
      form.querySelector('input[name="besoins"]').click();
      form.querySelectorAll('[data-hl-next]')[1].click();
      fillForm(document);
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(document.querySelector('.hl-lf-head').hidden, false);
      assert.equal(form.querySelector('.hl-lf-success').hidden, true);
      assert.equal(form.querySelector('[data-hl-alert]').hidden, false);
    } finally { dom.window.close(); }
  });

  test(`${name} : sélection au clavier et fermeture`, () => {
    const { dom, window, document } = openPage(name);
    try {
      const trigger = document.querySelector('.hl-lf-select__trigger');
      const list = document.querySelector('.hl-lf-select__list');
      const key = k => trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      key('ArrowDown');
      assert.equal(list.hidden, false);
      key('End');
      key('Enter');
      assert.equal(document.querySelector('[name="volume"]').value, 'Plus de 1000');
      assert.equal(list.hidden, true);
      key(' ');
      key('Escape');
      assert.equal(list.hidden, true);
    } finally { dom.window.close(); }
  });
}
