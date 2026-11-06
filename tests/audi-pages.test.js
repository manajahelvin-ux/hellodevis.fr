const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const pages = {
  'audi-q6': 'formulaire-audi-q6',
  'audi-q4': 'formulaire-audi-q4',
  'audi-a5': 'formulaire-audi-a5',
  'audi-a2': 'formulaire-audi-a2',
  'audi-q3': 'formulaire-audi-q3',
  'audi-a3-b2c': 'formulaire-audi-a3',
  'audi-q4-b2c': 'formulaire-audi-q4',
  'audi-a2-b2c': 'formulaire-audi-a2',
};

for (const [name, formPath] of Object.entries(pages)) {
  test(`${name} : responsive, formulaire et CTA`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', name, 'index.html'), 'utf8');
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => {});
    const dom = new JSDOM(html, { url: `https://www.hellodevis.fr/${name}/`, virtualConsole });
    try {
      const { document } = dom.window;
      const iframe = document.querySelector('iframe#form_audi');
      assert.ok(iframe, 'iframe du formulaire présente');
      assert.equal(iframe.title, 'Formulaire de demande d’offre Audi');
      const source = new URL(iframe.src);
      assert.equal(source.hostname, 'www.ubepro.fr');
      assert.equal(source.pathname, `/formulaires-audi/${formPath}`);
      assert.equal(source.searchParams.get('ltm_source'), 'SMS');
      assert.equal(source.searchParams.get('ltm_category'), '223');

      const cta = document.querySelector('a.audi-cta[href="#form_audi"]');
      assert.ok(cta, 'CTA visible pointant vers le formulaire');
      assert.equal(cta.textContent.trim(), 'Obtenir mon offre Audi');
      assert.equal(document.querySelectorAll('a[href="#"]').length, 0, 'aucun faux bouton sans destination');
      assert.ok(document.querySelectorAll('.audi-badge').length >= 2);

      assert.match(html, /@media \(max-width: 900px\)/, 'affichage tablette en une colonne');
      assert.match(html, /repeat\(1, minmax\(0, 1fr\)\)/, 'grille responsive sans largeur minimale forcée');
      assert.match(html, /overflow-wrap: break-word/, 'textes longs protégés contre les débordements');
    } finally {
      dom.window.close();
    }
  });
}
