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
  
  describe('Operator Page Setup', () => {
    beforeEach(() => {
      resetCapacitorMocks();
  
      setMockPreferences({
        [MAP_IMAGE_URI_KEY]: null,
        [MAP_SECTIONS_KEY]: JSON.stringify([]),
        [PRODUCTS_KEY]: JSON.stringify([])
      });
      setMockFilesystem({});
  
      cy.wrap((window as any).exposedSpies.globalWriteFile).as('writeFileSpy');
      cy.wrap((window as any).exposedSpies.globalSetPreference).as('setPreferencesSpy');
      cy.wrap((window as any).exposedSpies.globalToastShow).as('showToastSpy');
  
      cy.visit('/tabs/operator', {
        onBeforeLoad: (win) => {
          applyCapacitorMocksToWindow(win);
          if (!(win as any).testState) {
              (win as any).testState = { getMapImageSrc: () => null };
          }
          Cypress.env('cyCurrentIonicModalOptions', null);
        }
      });
  
      cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="operator-canvas"]').should('be.visible');
      cy.get('[data-testid="load-image-button"]').should('be.visible');
    });
  
    it('should allow operator to load map, draw section, add product, assign section, and save', () => {
      cy.get('[data-testid="image-file-input"]')
        .selectFile('cypress/fixtures/test-map.png', { force: true });
  
      cy.get('[data-testid="operator-canvas"]', { timeout: 10000 }).should((canvasEl) => {
        const canvas = canvasEl[0] as HTMLCanvasElement;
        expect(canvas.width, "Canvas internal drawing buffer width").to.equal(1136);
        expect(canvas.height, "Canvas internal drawing buffer height").to.equal(569);
      });
  
      cy.window({ timeout: 10000 }).should(win => {
        expect((win as any).testState, "window.testState should exist").to.exist;
        expect((win as any).testState.getMapImageSrc, "window.testState.getMapImageSrc should be a function").to.be.a('function');
        const imgSrc = (win as any).testState.getMapImageSrc();
        expect(imgSrc, "mapImageSrc via testState").to.not.be.null;
        expect(imgSrc, "mapImageSrc value").to.be.a('string').and.include('data:image');
      });
  
      cy.get('[data-testid="operator-canvas"]')
        .trigger('mousedown', 10, 10, { force: true })
        .trigger('mousemove', 110, 110, { force: true })
        .trigger('mouseup', { force: true });
  
      cy.wait(100);
  
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
  
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions, 'Alert options for section name from poll').to.not.be.null;
        expect(alertOptions.header, 'Alert header from poll').to.equal('Название секции');
        const okButton = alertOptions.buttons.find((b: any) => b.text === 'ОК');
        expect(okButton, 'OK button in section alert from poll').to.exist;
        const inputName = alertOptions.inputs[0].name || 'sectionName';
        const alertInputData = { [inputName]: 'Молочные продукты' };
        okButton.handler(alertInputData);
  
        cy.window({ log: false }).then(win => {
          const presentSpy = (win as any).alertControllerPresentSpy;
          expect(presentSpy, 'Section alert present spy').to.have.been.calledOnce;
        });
      });
  
      cy.get('[data-testid="defined-sections-list-container"] ul li')
        .should('have.length', 1)
        .and('contain.text', 'Молочные продукты');
  
      cy.get('[data-testid="add-product-button"]').click();
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions, 'Add product alert options from poll').to.not.be.null;
        expect(alertOptions.header).to.equal('Новый товар');
        const addButton = alertOptions.buttons.find((b: any) => b.text === 'Добавить');
        expect(addButton, 'Add product alert "Добавить" button from poll').to.exist;
        const inputName = alertOptions.inputs[0].name || 'productName';
        const alertInputData = { [inputName]: 'Молоко Простоквашино' };
        addButton.handler(alertInputData);
  
        cy.window({ log: false }).then(win => {
          const presentSpy = (win as any).alertControllerPresentSpy;
          expect(presentSpy, 'Add product alert present spy').to.have.been.called;
        });
      });
  
      cy.contains('[data-testid^="product-item-"] ion-label h2', 'Молоко Простоквашино').should('be.visible');
      cy.contains('[data-testid^="product-item-"] ion-label p', 'Секции: Не заданы').should('be.visible');
  
      cy.contains('[data-testid^="product-item-"]', 'Молоко Простоквашино')
        .find('[data-testid^="assign-sections-button-"]')
        .click();
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions, 'Assign sections alert options from poll').to.not.be.null;
        expect(alertOptions.header).to.include('Секции для');
        const saveButton = alertOptions.buttons.find((b: any) => b.text === 'Сохранить');
        expect(saveButton, 'Assign sections alert "Сохранить" button from poll').to.exist;
        const selectedSections = ['Молочные продукты'];
        saveButton.handler(selectedSections);
  
        cy.window({ log: false }).then(win => {
          const presentSpy = (win as any).alertControllerPresentSpy;
          expect(presentSpy, 'Assign sections alert present spy').to.have.been.called;
        });
      });
  
      cy.contains('[data-testid^="product-item-"] ion-label p', 'Секции: Молочные продукты')
        .should('be.visible');
  
      cy.get('[data-testid="save-all-button"]').click();
  
      cy.get('@writeFileSpy')
        .should('have.been.calledOnce')
        .and('have.been.calledWithMatch', Cypress.sinon.match({
          path: SAVED_MAP_FILENAME,
        }));
  
      cy.get('@setPreferencesSpy').should('have.been.calledThrice');
  
      cy.get('@setPreferencesSpy')
        .should('have.been.calledWithMatch', Cypress.sinon.match({ key: MAP_SECTIONS_KEY }));
  
      cy.get('@setPreferencesSpy')
        .should('have.been.calledWithMatch', Cypress.sinon.match({ key: PRODUCTS_KEY }));
  
      cy.get('@setPreferencesSpy')
        .should('have.been.calledWithMatch', Cypress.sinon.match({
          key: MAP_IMAGE_URI_KEY,
          value: SAVED_MAP_FILENAME
        }));
  
      cy.get('@showToastSpy')
        .should('have.been.calledWithMatch', Cypress.sinon.match({
          text: 'Все данные успешно сохранены!',
        }));
    });
  });