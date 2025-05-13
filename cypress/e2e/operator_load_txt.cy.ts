import {
    setMockPreferences,
    setMockFilesystem,
    applyCapacitorMocksToWindow,
    resetCapacitorMocks
  } from '../support/capacitor-mocks';
  
  const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
  const MAP_SECTIONS_KEY = 'storeMapSections';
  const PRODUCTS_KEY = 'storeProducts';
  
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
  
  describe('Operator - TXT Product Import', () => {
    const initialSections = ["Фрукты", "Молоко", "Бакалея"];
    const initialProductName = "Старый Продукт";
    const initialProductSection = "Молоко";
  
    const txtFileContent = `Новый Продукт1;Фрукты
  Старый Продукт;Бакалея
  Продукт Без Секции В Файле
  Продукт С Несуществующей Секцией;Космос
  Продукт С Несколькими Секциями;Фрукты,Молоко
  Некорректная строка без точки с запятой
  ;Только секции
  Товар Пустая Секция;`;
    const txtFixturePath = 'cypress/fixtures/temp_products_import.txt';
  
    beforeEach(() => {
      resetCapacitorMocks();
  
      setMockPreferences({
        [MAP_IMAGE_URI_KEY]: null,
        [MAP_SECTIONS_KEY]: JSON.stringify([]),
        [PRODUCTS_KEY]: JSON.stringify([])
      });
      setMockFilesystem({});
  
      cy.writeFile(txtFixturePath, txtFileContent);
  
      cy.wrap((window as any).exposedSpies.globalWriteFile).as('writeFileSpy');
      cy.wrap((window as any).exposedSpies.globalSetPreference).as('setPreferencesSpy');
      cy.wrap((window as any).exposedSpies.globalToastShow).as('showToastSpy');
  
      cy.visit('/tabs/operator', {
        onBeforeLoad: (win) => {
          applyCapacitorMocksToWindow(win);
          if (!(win as any).testState) {
            (win as any).testState = {
              getMapImageSrc: () => null,
              getIsDrawing: () => false,
              getCurrentRect: () => null
            };
          }
          Cypress.env('cyCurrentIonicModalOptions', null);
        }
      });
  
      cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
      cy.get('[data-testid="operator-canvas"]').should('be.visible');
    });
  
    function ensureItemIsVisibleAndVerify(itemText: string, h2Text: string, pText: string) {
      const productListContainer = '[data-testid="product-list-container"]';
      const ionContentSelector = 'ion-content';
  
      cy.get(productListContainer).contains('[data-testid^="product-item-"]', itemText)
        .then($item => {
          cy.get(ionContentSelector).find('.inner-scroll, main').first()
            .scrollTo(0, $item[0].offsetTop > 100 ? $item[0].offsetTop - 100 : 0, { duration: 100, ensureScrollable: false });
          cy.wait(200);
          cy.wrap($item).should('be.visible');
        })
        .within(() => {
          cy.contains('h2', h2Text).should('be.visible');
          cy.contains('p', pText).should('be.visible');
        });
    }
  
    it('should correctly import products from TXT file with various scenarios', () => {
      cy.get('[data-testid="image-file-input"]').selectFile('cypress/fixtures/test-map.png', { force: true });
      cy.get('[data-testid="operator-canvas"]', { timeout: 10000 }).should((canvasEl) => {
        const canvas = canvasEl[0] as HTMLCanvasElement;
        expect(canvas.width, "Canvas width after map load").to.equal(1136);
        expect(canvas.height, "Canvas height after map load").to.equal(569);
      });
  
      cy.window({ timeout: 7000 })
        .should(win => {
          expect((win as any).testState, "window.testState should exist").to.exist;
          if (!((win as any).testState && (win as any).testState.getMapImageSrc)) {
              throw new Error('window.testState.getMapImageSrc is not available for checking mapImageSrc');
          }
          expect((win as any).testState.getMapImageSrc, "window.testState.getMapImageSrc should be a function").to.be.a('function');
          const imgSrc = (win as any).testState.getMapImageSrc();
          expect(imgSrc, "mapImageSrc via testState after image load").to.not.be.null;
          expect(imgSrc, "mapImageSrc value after image load").to.be.a('string').and.include('data:image');
        });
  
      let sectionCoordsX = 10;
      initialSections.forEach((sectionName) => {
        cy.get('[data-testid="operator-canvas"]')
          .trigger('mousedown', sectionCoordsX, 10, { force: true })
          .trigger('mousemove', sectionCoordsX + 50, 60, { force: true })
          .trigger('mouseup', { force: true });
        cy.wait(100);
  
        pollForAlertOptionsFromEnv().then((alertOptions: any) => {
          expect(alertOptions.header).to.equal('Название секции');
          const okButton = alertOptions.buttons.find((b: any) => b.text === 'ОК');
          okButton.handler({ [(alertOptions.inputs[0].name || 'sectionName')]: sectionName });
        });
        cy.get('[data-testid^="section-list-item-"]').contains(sectionName).should('be.visible');
        sectionCoordsX += 70;
      });
      cy.get('[data-testid="defined-sections-list-container"] ul li').should('have.length', initialSections.length);
  
      cy.get('[data-testid="add-product-button"]').click();
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions.header).to.equal('Новый товар');
        const addButton = alertOptions.buttons.find((b: any) => b.text === 'Добавить');
        addButton.handler({ [(alertOptions.inputs[0].name || 'productName')]: initialProductName });
      });
      cy.contains('[data-testid^="product-item-"]', initialProductName).scrollIntoView().should('be.visible');
  
      cy.contains('[data-testid^="product-item-"]', initialProductName)
        .find('[data-testid^="assign-sections-button-"]').click();
      cy.wait(100);
      pollForAlertOptionsFromEnv().then((alertOptions: any) => {
        expect(alertOptions.header).to.include(`Секции для "${initialProductName}"`);
        const saveButton = alertOptions.buttons.find((b: any) => b.text === 'Сохранить');
        saveButton.handler([initialProductSection]);
      });
      cy.contains('[data-testid^="product-item-"]', initialProductName)
        .find('p').scrollIntoView().should('contain.text', `Секции: ${initialProductSection}`);
  
      cy.get('[data-testid="txt-file-input"]').selectFile(txtFixturePath, { force: true });
  
      cy.get('@showToastSpy').should('have.been.calledWithMatch', {
        text: Cypress.sinon.match(/Импорт завершен\. Добавлено: 4, Обновлено: 1\. Предупреждений: 2/),
        duration: 'long'
      });
  
      const productListContainer = '[data-testid="product-list-container"]';
  
      ensureItemIsVisibleAndVerify('Новый Продукт1', 'Новый Продукт1', 'Секции: Фрукты');
      ensureItemIsVisibleAndVerify('Старый Продукт', 'Старый Продукт', 'Секции: Бакалея');
  
      cy.get(productListContainer).should('not.contain.text', 'Продукт Без Секции В Файле');
  
      ensureItemIsVisibleAndVerify('Продукт С Несуществующей Секцией', 'Продукт С Несуществующей Секцией', 'Секции: Не заданы');
      ensureItemIsVisibleAndVerify('Продукт С Несколькими Секциями', 'Продукт С Несколькими Секциями', 'Секции: Фрукты, Молоко');
      ensureItemIsVisibleAndVerify('Товар Пустая Секция', 'Товар Пустая Секция', 'Секции: Не заданы');
  
      cy.get(productListContainer).find('[data-testid^="product-item-"]').should('have.length', 5);
      cy.get(productListContainer).should('not.contain.text', 'Некорректная строка без точки с запятой');
      cy.get(productListContainer).should('not.contain.text', 'Только секции');
  
      cy.get('[data-testid="save-all-button"]').click();
      cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Все данные успешно сохранены!' });
  
      cy.get('@setPreferencesSpy').should('have.been.calledWithMatch', Cypress.sinon.match({
          key: PRODUCTS_KEY,
          value: Cypress.sinon.match((value: string) => {
              const products = JSON.parse(value);
              expect(products, 'Parsed products from Preferences value').to.have.lengthOf(5);
  
              const pСтарый = products.find((p: any) => p.name === 'Старый Продукт');
              expect(pСтарый, '"Старый Продукт" in preferences').to.exist;
              if (pСтарый) expect(pСтарый.sectionNames, '"Старый Продукт" sections').to.deep.equal(['Бакалея']);
  
              const pНовый1 = products.find((p: any) => p.name === 'Новый Продукт1');
              expect(pНовый1, '"Новый Продукт1" in preferences').to.exist;
              if (pНовый1) expect(pНовый1.sectionNames, '"Новый Продукт1" sections').to.deep.equal(['Фрукты']);
  
              const pБезСекции = products.find((p: any) => p.name === 'Продукт Без Секции В Файле');
              expect(pБезСекции, '"Продукт Без Секции В Файле" in preferences').to.not.exist;
  
              const pНесущСекция = products.find((p: any) => p.name === 'Продукт С Несуществующей Секцией');
              expect(pНесущСекция, '"Продукт С Несуществующей Секцией" in preferences').to.exist;
              if (pНесущСекция) expect(pНесущСекция.sectionNames, '"Продукт С Несуществующей Секцией" sections').to.deep.equal([]);
  
              const pНескСекций = products.find((p: any) => p.name === 'Продукт С Несколькими Секциями');
              expect(pНескСекций, '"Продукт С Несколькими Секциями" in preferences').to.exist;
              if (pНескСекций) expect(pНескСекций.sectionNames, '"Продукт С Несколькими Секциями" sections').to.have.members(['Фрукты', 'Молоко']);
  
              const pПустаяСекция = products.find((p: any) => p.name === 'Товар Пустая Секция');
              expect(pПустаяСекция, '"Товар Пустая Секция" in preferences').to.exist;
              if (pПустаяСекция) expect(pПустаяСекция.sectionNames, '"Товар Пустая Секция" sections').to.deep.equal([]);
  
              return true;
          })
      }));
  
      cy.visit('/tabs/search');
      cy.get('[data-testid="search-input"]').should('be.visible');
  
      cy.visit('/tabs/operator', {
        onBeforeLoad: (win) => {
          applyCapacitorMocksToWindow(win);
          if (!(win as any).testState) {
            (win as any).testState = {
              getMapImageSrc: () => null,
              getIsDrawing: () => false,
              getCurrentRect: () => null
            };
          }
        }
      });
  
      cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
  
      cy.get(productListContainer).find('[data-testid^="product-item-"]', { timeout: 15000 })
          .should('have.length', 5);
  
      cy.get(productListContainer).find('[data-testid^="product-item-"]').as('reloadedProductListItems');
  
      ensureItemIsVisibleAndVerify('Новый Продукт1', 'Новый Продукт1', 'Секции: Фрукты');
      ensureItemIsVisibleAndVerify('Старый Продукт', 'Старый Продукт', 'Секции: Бакалея');
      cy.get(productListContainer).should('not.contain.text', 'Продукт Без Секции В Файле');
      ensureItemIsVisibleAndVerify('Продукт С Несуществующей Секцией', 'Продукт С Несуществующей Секцией', 'Секции: Не заданы');
      ensureItemIsVisibleAndVerify('Продукт С Несколькими Секциями', 'Продукт С Несколькими Секциями', 'Секции: Фрукты, Молоко');
      ensureItemIsVisibleAndVerify('Товар Пустая Секция', 'Товар Пустая Секция', 'Секции: Не заданы');
  
    });
  });