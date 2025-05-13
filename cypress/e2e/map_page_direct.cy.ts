import {
    setMockPreferences,
    setMockFilesystem,
    applyCapacitorMocksToWindow,
    resetCapacitorMocks
  } from '../support/capacitor-mocks';
  
  const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
  const MAP_SECTIONS_KEY = 'storeMapSections';
  const PRODUCTS_KEY = 'storeProducts';
  const SAVED_MAP_FILENAME = 'storeMapImage.txt';
  const mockMapFileUriForPreferences = `mock://filesystem/DATA/${SAVED_MAP_FILENAME}`;
  const mockMapFileContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  
  describe('Map Page - Direct Navigation and Error States', () => {
  
    const testSections = [
      { id: 's1', name: 'Dairy', coords: { x: 10, y: 10, w: 50, h: 50 } },
      { id: 's2', name: 'Bakery', coords: { x: 70, y: 10, w: 50, h: 50 } },
      { id: 's3', name: 'Produce', coords: { x: 10, y: 70, w: 50, h: 50 } }
    ];
    const testProducts = [
      { id: 'p1', name: 'Milk', sectionNames: ['Dairy'] },
      { id: 'p2', name: 'Bread', sectionNames: ['Bakery'] }
    ];
  
    beforeEach(() => {
      resetCapacitorMocks();
    });
  
    it('should highlight multiple sections when navigated directly with query params', () => {
      setMockPreferences({
        [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
        [PRODUCTS_KEY]: JSON.stringify(testProducts),
        [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
      });
      setMockFilesystem({
        [mockMapFileUriForPreferences]: mockMapFileContent
      });
  
      cy.visit('/tabs/map?sections=Dairy|Bakery', {
        onBeforeLoad: applyCapacitorMocksToWindow
      });
  
      cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="map-container"]').should('be.visible');
  
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Dairy-highlighted"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'green');
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Bakery-highlighted"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'green');
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Produce"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'grey');
  
      cy.get('[data-testid="results-list"]').should('not.exist');
      cy.get('[data-testid="highlight-info"]')
        .should('be.visible')
        .and('contain.text', 'Подсвечены секции: Dairy, Bakery');
    });
  
    it('should highlight a single section when navigated directly', () => {
      setMockPreferences({
        [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
        [PRODUCTS_KEY]: JSON.stringify(testProducts),
        [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
      });
      setMockFilesystem({
        [mockMapFileUriForPreferences]: mockMapFileContent
      });
  
      cy.visit('/tabs/map?sections=Produce', { onBeforeLoad: applyCapacitorMocksToWindow });
  
      cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Produce-highlighted"]', { timeout: 5000 }).should('exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Dairy"]', { timeout: 5000 }).should('exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Bakery"]', { timeout: 5000 }).should('exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]').should('have.length', 1);
  
      cy.get('[data-testid="highlight-info"]')
        .should('be.visible')
        .and('contain.text', 'Подсвечены секции: Produce');
    });
  
    it('should show default map state with no highlights when navigated without query params', () => {
      setMockPreferences({
        [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
        [PRODUCTS_KEY]: JSON.stringify(testProducts),
        [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
      });
      setMockFilesystem({
        [mockMapFileUriForPreferences]: mockMapFileContent
      });
  
      cy.visit('/tabs/map', { onBeforeLoad: applyCapacitorMocksToWindow });
  
      cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]', { timeout: 5000 }).should('not.exist');
      cy.get('[data-testid="map-svg-overlay"] [data-testid^="section-rect-"]', { timeout: 5000 }).should('have.length', 3);
  
      cy.get('[data-testid="results-list"]').should('not.exist');
      cy.get('[data-testid="highlight-info"]').should('not.exist');
      cy.get('[data-testid="no-search-info"]')
        .should('be.visible')
        .and('contain.text', 'Для отображения списка "Товар-Секция" найдите товары через Поиск.');
    });
  
    it('should show map error placeholder if map image file is missing from storage', () => {
      setMockPreferences({
        [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
        [PRODUCTS_KEY]: JSON.stringify(testProducts),
        [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
      });
      setMockFilesystem({});
  
      cy.visit('/tabs/map', { onBeforeLoad: applyCapacitorMocksToWindow });
  
      cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="map-error-placeholder"]', { timeout: 5000 })
        .should('be.visible')
        .and('contain.text', 'Не удалось загрузить карту');
    });
  
    it('should show map error placeholder if map URI is missing from preferences', () => {
      setMockPreferences({
        [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
        [PRODUCTS_KEY]: JSON.stringify(testProducts),
        [MAP_IMAGE_URI_KEY]: null
      });
      setMockFilesystem({});
  
      cy.visit('/tabs/map', { onBeforeLoad: applyCapacitorMocksToWindow });
  
      cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="map-error-placeholder"]', { timeout: 5000 })
        .should('be.visible')
        .and('contain.text', 'Не удалось загрузить карту');
    });
  
  });