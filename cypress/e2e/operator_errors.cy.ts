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
  
  function pollForAlertOptionsFromEnv(retries = 30, delay = 100): Cypress.Chainable<any> {
    const opts = Cypress.env('cyCurrentIonicModalOptions');
    if (opts && typeof opts === 'object' && opts.header) {
      return cy.wrap(opts, { log: false });
    }
    if (retries > 0) {
      return cy.wait(delay, { log: false }).then(() => pollForAlertOptionsFromEnv(retries - 1, delay));
    }
    throw new Error('Alert options (Cypress.env("cyCurrentIonicModalOptions")) not set or invalid after polling.');
  }
  
  describe('Operator Page - Deletions and Error Handling', () => {
    beforeEach(() => {
      resetCapacitorMocks();
  
      const initialSections = [
        { id: 's1', name: 'Fruits', coords: { x: 10, y: 10, w: 50, h: 50 } },
        { id: 's2', name: 'Veggies', coords: { x: 70, y: 10, w: 50, h: 50 } }
      ];
      const initialProducts = [
        { id: 'p1', name: 'Apple', sectionNames: ['Fruits'] },
        { id: 'p2', name: 'Broccoli', sectionNames: ['Veggies'] }
      ];
  
      setMockPreferences({
        [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences,
        [MAP_SECTIONS_KEY]: JSON.stringify(initialSections),
        [PRODUCTS_KEY]: JSON.stringify(initialProducts)
      });
      setMockFilesystem({
        [mockMapFileUriForPreferences]: mockMapFileContent
      });
  
      cy.wrap((window as any).exposedSpies.globalWriteFile).as('writeFileSpy');
      cy.wrap((window as any).exposedSpies.globalSetPreference).as('setPreferencesSpy');
      cy.wrap((window as any).exposedSpies.globalToastShow).as('showToastSpy');
  
      cy.visit('/tabs/operator', {
        onBeforeLoad: (win) => {
          applyCapacitorMocksToWindow(win);
          if (!(win as any).testState) { (win as any).testState = { getMapImageSrc: () => mockMapFileContent, getIsDrawing:()=>false, getCurrentRect:()=>null }; }
          Cypress.env('cyCurrentIonicModalOptions', null);
        }
      });
  
      cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="section-list-item-s1"]', { timeout: 5000 }).should('contain.text', 'Fruits');
      cy.get('[data-testid="section-list-item-s2"]', { timeout: 5000 }).should('contain.text', 'Veggies');
      cy.get('[data-testid="product-item-p1"]', { timeout: 5000 }).should('contain.text', 'Apple');
      cy.get('[data-testid="product-item-p2"]', { timeout: 5000 }).should('contain.text', 'Broccoli');
    });
  
    it('should allow deleting a product and persist the change', () => {
      cy.get('[data-testid="delete-product-button-p1"]').click();
  
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions.header).to.equal('Подтверждение удаления');
        expect(alertOptions.message).to.include('удалить товар "Apple"');
        const deleteButton = alertOptions.buttons.find((b: any) => b.text === 'Удалить');
        expect(deleteButton).to.exist;
        deleteButton.handler();
      });
  
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: Cypress.sinon.match(/Товар "Apple" удален/) });
  
      cy.get('[data-testid="product-item-p1"]').should('not.exist');
      cy.get('[data-testid="product-item-p2"]').should('exist');
      cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 1);
  
      cy.get('[data-testid="save-all-button"]').click();
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Все данные успешно сохранены!' });
  
      cy.get('@setPreferencesSpy').should('have.been.calledWithMatch', Cypress.sinon.match({
        key: PRODUCTS_KEY,
        value: Cypress.sinon.match((value: string) => {
          const products = JSON.parse(value);
          expect(products).to.have.lengthOf(1);
          expect(products[0].name).to.equal('Broccoli');
          return true;
        })
      }));
  
      cy.visit('/tabs/operator', {
        onBeforeLoad: (win) => {
          applyCapacitorMocksToWindow(win);
          if (!(win as any).testState) { (win as any).testState = { getMapImageSrc: () => mockMapFileContent, getIsDrawing:()=>false, getCurrentRect:()=>null }; }
        }
      });
      cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="product-item-p1"]', { timeout: 5000 }).should('not.exist');
      cy.get('[data-testid="product-item-p2"]', { timeout: 5000 }).should('exist').and('contain.text', 'Broccoli');
      cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 1);
    });
  
    it('should show error toasts for invalid actions', () => {
      cy.writeFile('cypress/fixtures/not_an_image.txt', 'This is not an image').then(() => {
        cy.get('[data-testid="image-file-input"]').selectFile('cypress/fixtures/not_an_image.txt', { force: true });
      });
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Пожалуйста, выберите файл изображения.' });
      cy.get('[data-testid="defined-sections-list-container"] ul li').should('have.length', 2);
      cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);
  
      cy.get('[data-testid="txt-file-input"]').selectFile('cypress/fixtures/test-map.png', { force: true });
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Пожалуйста, выберите файл .txt' });
      cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);
  
      cy.get('[data-testid="add-product-button"]').click();
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions.header).to.equal('Новый товар');
        alertOptions.buttons.find((b: any) => b.text === 'Добавить').handler({ productName: 'Apple' });
      });
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Товар с именем "Apple" уже существует!' });
      cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);
  
      cy.get('[data-testid="operator-canvas"]')
        .trigger('mousedown', 150, 10, { force: true })
        .trigger('mousemove', 200, 60, { force: true })
        .trigger('mouseup', { force: true });
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions.header).to.equal('Название секции');
        alertOptions.buttons.find((b: any) => b.text === 'ОК').handler({ sectionName: 'Fruits' });
      });
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Секция с именем "Fruits" уже существует!' });
      cy.get('[data-testid="defined-sections-list-container"] ul li').should('have.length', 2);
    });
  });