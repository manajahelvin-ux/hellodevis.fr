const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const pages = {
  'audi-a1': 'formulaire-audi-a1',
  'audi-a3': 'formulaire-audi-a3',
  'audi-a3-2': 'formulaire-audi-a3',
  'audi-q5': 'formulaire-audi-q5',
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

// Pages B2B dont les mentions légales ont été revues (Q6, Q4, A5, A2) :
// éditeur Hellodevis + liens vers nos propres mentions et notre politique de confidentialité.
const legalPages = ['audi-a2', 'audi-a5', 'audi-q4', 'audi-q6'];

for (const name of legalPages) {
  test(`${name} : mentions légales Hellodevis et politique de confidentialité liées`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', name, 'index.html'), 'utf8');
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => {});
    const dom = new JSDOM(html, { url: `https://www.hellodevis.fr/${name}/`, virtualConsole });
    try {
      const { document } = dom.window;
      const mentions = [...document.querySelectorAll('a[href="/mentions-legales/"]')];
      const policies = [...document.querySelectorAll('a[href="/politique-de-confidentialite-donnees-personnelles/"]')];
      assert.equal(mentions.length, 1, 'un lien unique vers nos mentions légales');
      assert.equal(policies.length, 2, 'politique de confidentialité liée dans le bloc éditeur et dans la phrase droits');

      const publisher = mentions[0].closest('p').textContent;
      assert.match(publisher, /Site édité par Hellodevis/);
      assert.match(publisher, /B 798 043 634/);
      assert.equal(mentions[0].textContent.trim(), 'Mentions légales');

      const rightsP = [...document.querySelectorAll('p')]
        .find(p => p.textContent.includes('Pour en savoir plus sur la gestion de vos données personnelles'));
      assert.ok(rightsP, 'phrase sur les droits des personnes présente');
      const rightsLink = rightsP.querySelector('a[href="/politique-de-confidentialite-donnees-personnelles/"]');
      assert.ok(rightsLink, 'la phrase renvoie vers notre politique de confidentialité');
      assert.equal(rightsLink.textContent.trim(), 'politique de confidentialité');

      assert.ok(!html.includes('<br>.<br>'), 'plus de point orphelin avant le renvoi (1)');
    } finally {
      dom.window.close();
    }
  });
}
