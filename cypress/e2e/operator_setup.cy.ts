// Импорт вспомогательных функций для управления моками плагинов Capacitor.
// Это ключевой аспект для тестирования в браузере функциональности,
// которая обычно зависит от нативной среды устройства.
import {
  setMockPreferences,
  setMockFilesystem,
  applyCapacitorMocksToWindow,
  resetCapacitorMocks
} from '../support/capacitor-mocks';

// Константы для ключей хранения данных и имени файла.
// Использование констант помогает избежать ошибок, связанных с опечатками в строковых литералах,
// и упрощает рефакторинг, если ключи или имена файлов изменятся.
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';

// Описание тестового набора для базовой настройки страницы Оператора.
// Этот набор тестов проверяет основной сценарий работы оператора.
describe('Operator Page Setup', () => {
  // Хук beforeEach выполняется перед каждым тестом в этом наборе.
  // Он отвечает за подготовку начального состояния: сброс моков, установку
  // начальных (пустых) данных в мок-хранилища, оборачивание шпионов для проверок
  // и загрузку страницы оператора с применением моков.
  beforeEach(() => {
    resetCapacitorMocks(); // Гарантирует изоляцию тестов друг от друга.

    // Установка начального "чистого" состояния для Preferences и Filesystem.
    setMockPreferences({
      [MAP_IMAGE_URI_KEY]: null,
      [MAP_SECTIONS_KEY]: JSON.stringify([]),
      [PRODUCTS_KEY]: JSON.stringify([])
    });
    setMockFilesystem({});

    // Оборачивание шпионов (spies) из `capacitor-mocks.ts` для возможности
    // отслеживания их вызовов и аргументов в тестах (`cy.get('@spyName')`).
    cy.wrap((window as any).exposedSpies.globalWriteFile).as('writeFileSpy');
    cy.wrap((window as any).exposedSpies.globalSetPreference).as('setPreferencesSpy');
    cy.wrap((window as any).exposedSpies.globalToastShow).as('showToastSpy');

    // Переход на страницу оператора.
    // В хуке `onBeforeLoad` происходит применение моков к окну загружаемого приложения.
    cy.visit('/tabs/operator', {
      onBeforeLoad: (win) => {
        applyCapacitorMocksToWindow(win); // Применяем моки.
        // Инициализация `testState` в окне приложения, если его нет.
        // `testState` используется для доступа к внутреннему состоянию компонента OperatorPage.vue из тестов.
        if (!(win as any).testState) {
            (win as any).testState = { getMapImageSrc: () => null };
        }
        Cypress.env('cyCurrentIonicModalOptions', null); // Очищаем возможные оставшиеся опции модального окна.
      }
    });

    // Ожидание завершения загрузки и появления ключевых элементов на странице.
    cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="operator-canvas"]').should('be.visible');
    cy.get('[data-testid="load-image-button"]').should('be.visible');
  });

  // Тест, проверяющий полный цикл действий оператора:
  // загрузка карты, рисование секции, добавление товара, назначение секции товару и сохранение всех данных.
  it('should allow operator to load map, draw section, add product, assign section, and save', () => {
    // 1. Загрузка изображения карты магазина.
    // Используется фикстура `test-map.png`. `force: true` необходимо для скрытого input.
    cy.get('[data-testid="image-file-input"]')
      .selectFile('cypress/fixtures/test-map.png', { force: true });

    // Проверка, что холст (canvas) изменил свои внутренние размеры в соответствии с загруженным изображением.
    cy.get('[data-testid="operator-canvas"]', { timeout: 10000 }).should((canvasEl) => {
      const canvas = canvasEl[0] as HTMLCanvasElement;
      expect(canvas.width, "Canvas internal drawing buffer width").to.equal(1136);
      expect(canvas.height, "Canvas internal drawing buffer height").to.equal(569);
    });

    // Проверка через `window.testState`, что `mapImageSrc` в компоненте был установлен
    // и содержит валидный Data URL изображения.
    cy.window({ timeout: 10000 }).should(win => {
      expect((win as any).testState, "window.testState should exist").to.exist;
      expect((win as any).testState.getMapImageSrc, "window.testState.getMapImageSrc should be a function").to.be.a('function');
      const imgSrc = (win as any).testState.getMapImageSrc();
      expect(imgSrc, "mapImageSrc via testState").to.not.be.null;
      expect(imgSrc, "mapImageSrc value").to.be.a('string').and.include('data:image');
    });

    // 2. Рисование секции на холсте.
    // Имитируются события мыши для создания прямоугольной области.
    cy.get('[data-testid="operator-canvas"]')
      .trigger('mousedown', 10, 10, { force: true })
      .trigger('mousemove', 110, 110, { force: true })
      .trigger('mouseup', { force: true });

    cy.wait(100); // Небольшая пауза для обработки события и вызова модального окна.

    // Вспомогательная функция для "перехвата" опций модального окна Ionic
    // и взаимодействия с ним без прямого доступа к DOM элементам модального окна.
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

    // Ожидание появления модального окна для ввода имени секции и ввод имени.
    pollForAlertOptionsFromEnv().then((alertOptions: any) => {
      expect(alertOptions, 'Alert options for section name from poll').to.not.be.null;
      expect(alertOptions.header, 'Alert header from poll').to.equal('Название секции');
      const okButton = alertOptions.buttons.find((b: any) => b.text === 'ОК');
      expect(okButton, 'OK button in section alert from poll').to.exist;
      const inputName = alertOptions.inputs[0].name || 'sectionName';
      const alertInputData = { [inputName]: 'Молочные продукты' };
      okButton.handler(alertInputData); // Имитация нажатия "ОК" с введенными данными.

      // Проверка, что метод present() модального окна был вызван.
      cy.window({ log: false }).then(win => {
        const presentSpy = (win as any).alertControllerPresentSpy;
        expect(presentSpy, 'Section alert present spy').to.have.been.calledOnce;
      });
    });

    // Проверка отображения созданной секции в списке под холстом.
    cy.get('[data-testid="defined-sections-list-container"] ul li')
      .should('have.length', 1)
      .and('contain.text', 'Молочные продукты');

    // 3. Добавление нового товара через модальное окно.
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

    // Проверка появления нового товара в списке товаров с пометкой "Секции: Не заданы".
    cy.contains('[data-testid^="product-item-"] ion-label h2', 'Молоко Простоквашино').should('be.visible');
    cy.contains('[data-testid^="product-item-"] ion-label p', 'Секции: Не заданы').should('be.visible');

    // 4. Назначение секции "Молочные продукты" созданному товару.
    cy.contains('[data-testid^="product-item-"]', 'Молоко Простоквашино')
      .find('[data-testid^="assign-sections-button-"]')
      .click();
    cy.wait(100);
    pollForAlertOptionsFromEnv().then((alertOptions: any) => {
      expect(alertOptions, 'Assign sections alert options from poll').to.not.be.null;
      expect(alertOptions.header).to.include('Секции для');
      const saveButton = alertOptions.buttons.find((b: any) => b.text === 'Сохранить');
      expect(saveButton, 'Assign sections alert "Сохранить" button from poll').to.exist;
      const selectedSections = ['Молочные продукты']; // Имитация выбора секции.
      saveButton.handler(selectedSections);

      cy.window({ log: false }).then(win => {
        const presentSpy = (win as any).alertControllerPresentSpy;
        expect(presentSpy, 'Assign sections alert present spy').to.have.been.called;
      });
    });

    // Проверка, что у товара обновилась информация о назначенных секциях.
    cy.contains('[data-testid^="product-item-"] ion-label p', 'Секции: Молочные продукты')
      .should('be.visible');

    // 5. Сохранение всех внесенных изменений.
    cy.get('[data-testid="save-all-button"]').click();

    // 6. Проверка вызовов моков для функций сохранения данных.
    // Проверяем, что функция записи файла карты была вызвана один раз с корректным именем файла.
    cy.get('@writeFileSpy')
      .should('have.been.calledOnce')
      .and('have.been.calledWithMatch', Cypress.sinon.match({
        path: SAVED_MAP_FILENAME,
      }));

    // Проверяем, что функция сохранения в Preferences была вызвана трижды
    // (для URI карты, для секций и для продуктов).
    cy.get('@setPreferencesSpy').should('have.been.calledThrice');
    cy.get('@setPreferencesSpy')
      .should('have.been.calledWithMatch', Cypress.sinon.match({ key: MAP_SECTIONS_KEY }));
    cy.get('@setPreferencesSpy')
      .should('have.been.calledWithMatch', Cypress.sinon.match({ key: PRODUCTS_KEY }));
    cy.get('@setPreferencesSpy')
      .should('have.been.calledWithMatch', Cypress.sinon.match({
        key: MAP_IMAGE_URI_KEY,
        value: SAVED_MAP_FILENAME // Проверяем, что URI файла карты был сохранен.
      }));

    // Проверка вызова Toast-уведомления об успешном сохранении.
    cy.get('@showToastSpy')
      .should('have.been.calledWithMatch', Cypress.sinon.match({
        text: 'Все данные успешно сохранены!',
      }));
  });
});