import { setMockPreferences, setMockFilesystem, applyCapacitorMocksToWindow, resetCapacitorMocks } from '../support/capacitor-mocks';

const PRODUCTS_KEY = 'storeProducts';
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';

const testProducts = [
  { id: 'p1', name: 'Чипсы Lays', sectionNames: ['Бакалея'] },
  { id: 'p2', name: 'Кола', sectionNames: ['Напитки'] },
  { id: 'p3', name: 'Вода Святой Источник', sectionNames: [] }
];
const testSections = [
  { id: 's1', name: 'Бакалея', coords: { x: 10, y: 10, w: 50, h: 50 } },
  { id: 's2', name: 'Напитки', coords: { x: 70, y: 10, w: 50, h: 50 } }
];
const mockMapFileUriForPreferences = `mock://filesystem/DATA/${SAVED_MAP_FILENAME}`;
const mockMapFileContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Customer Search Flow', () => {
  beforeEach(() => {
    resetCapacitorMocks();
    setMockPreferences({
      [PRODUCTS_KEY]: JSON.stringify(testProducts),
      [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences,
      [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
    });
    setMockFilesystem({
      [mockMapFileUriForPreferences]: mockMapFileContent
    });

    cy.visit('/tabs/search', {
      onBeforeLoad: (win) => {
        applyCapacitorMocksToWindow(win);
        (win as any).Cypress = Cypress;
      }
    });
    cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="search-input"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="list-input-section"]', { timeout: 5000 }).should('be.visible');
    cy.wait(500, { log: true });
  });

  it('should find a product using search bar, show suggestions, navigate to map and highlight section', () => {
    cy.get('[data-testid="search-input"] input').type('Чипс', { force: true });
    cy.wait(300, {log: true});
    cy.get('[data-testid="suggestions-list"]', { timeout: 7000 }).should('be.visible');
    cy.get('[data-testid="suggestions-list"] [data-testid="suggestion-item-p1"]', { timeout: 5000 })
      .should('be.visible')
      .and('contain.text', 'Чипсы Lays')
      .click();

    cy.url({ timeout: 6000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        expect(params.get('sections')).to.eq('Бакалея');
    });

    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Бакалея-highlighted"]', { timeout: 7000 })
      .should('exist').and('have.attr', 'stroke', 'green');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Напитки"]')
      .should('exist').and('have.attr', 'stroke', 'grey');
    cy.get('[data-testid="results-info-container"] [data-testid="result-info-item-Чипсы Lays"]')
      .should('be.visible').and('contain.text', 'Секции: Бакалея');
  });

  it('should handle search for product with no sections assigned', () => {
    cy.get('[data-testid="search-input"] input').type('Вода Святой', { force: true });
    cy.wait(300, {log: true});
    cy.get('[data-testid="suggestions-list"]', { timeout: 7000 }).should('be.visible');
    cy.get('[data-testid="suggestions-list"] [data-testid="suggestion-item-p3"]', { timeout: 5000 })
      .should('be.visible')
      .contains('Вода Святой Источник')
      .click();

    cy.url({ timeout: 6000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        expect(params.get('sections')).to.be.null;
    });
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]', { timeout: 5000 }).should('not.exist');
    cy.get('[data-testid="results-info-container"] [data-testid="result-info-item-Вода Святой Источник"]')
      .should('be.visible')
      .should('contain.text', 'Расположение не указано');
  });

  it('should handle search for non-existent product', () => {
    cy.get('[data-testid="search-input"] input').type('ФантастическийТовар', { force: true });
    cy.wait(300, {log: true});
    cy.get('[data-testid="suggestions-list"]', { timeout: 1000 }).should('not.exist');
    cy.get('[data-testid="search-results-list"] [data-testid="no-results-message"]')
      .should('be.visible')
      .and('contain.text', 'По запросу "ФантастическийТовар" ничего не найдено.');
    cy.url().should('include', '/tabs/search');
  });

  it('should find multiple products from list and highlight sections on map', () => {
    const productList = "Чипсы Lays\nНесуществующийТоварИзСписка\nКола";
    cy.get('[data-testid="list-input"] textarea').type(productList, { force: true });
    cy.get('[data-testid="find-from-list-button"]').click();

    cy.url({ timeout: 7000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        const sectionsValue = params.get('sections');
        expect(sectionsValue).to.not.be.null;
        if (sectionsValue) {
            const sectionsArray = sectionsValue.split('|').sort();
            expect(sectionsArray).to.deep.eq(['Бакалея', 'Напитки'].sort());
        }
    });
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Бакалея-highlighted"]', { timeout: 7000 }).should('exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Напитки-highlighted"]', { timeout: 7000 }).should('exist');
    cy.get('[data-testid="results-info-container"] [data-testid="results-list"] ion-item').should('have.length', 3);
    cy.get('[data-testid="result-info-item-Чипсы Lays"]').should('contain.text', 'Секции: Бакалея');
    cy.get('[data-testid="result-info-item-НесуществующийТоварИзСписка"]').should('contain.text', 'Товар не найден');
    cy.get('[data-testid="result-info-item-Кола"]').should('contain.text', 'Секции: Напитки');
  });
});