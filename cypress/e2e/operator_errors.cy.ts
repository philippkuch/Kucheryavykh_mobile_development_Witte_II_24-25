// cypress/e2e/operator_errors.cy.ts
// Импорт вспомогательных функций для управления моками Capacitor плагинов,
// что позволяет симулировать поведение нативной среды и изолировать тесты.
import {
  setMockPreferences,
  setMockFilesystem,
  applyCapacitorMocksToWindow,
  resetCapacitorMocks
} from '../support/capacitor-mocks';

// Ключи для доступа к данным в Preferences и имя файла для карты.
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';
// Мок URI для файла карты, который будет "сохранен" в Preferences.
const mockMapFileUriForPreferences = `mock://filesystem/DATA/${SAVED_MAP_FILENAME}`;
// Мок содержимого файла карты (минимальное валидное изображение 1x1 пиксель в base64).
const mockMapFileContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Вспомогательная функция для ожидания и получения опций модального окна Ionic (Alert)
// из переменных окружения Cypress, куда их помещает мок createIonicControllerMock.
// Это позволяет тесту взаимодействовать с алертами, не полагаясь на DOM-элементы алерта.
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

// Тестовый набор для проверки функциональности удаления и обработки ошибок на странице Оператора.
describe('Operator Page - Deletions and Error Handling', () => {
  // Хук beforeEach выполняется перед каждым тестом в этом наборе.
  // Устанавливает начальное состояние моков (карта, секции, товары),
  // оборачивает шпионы и загружает страницу оператора.
  beforeEach(() => {
    resetCapacitorMocks(); // Сброс состояния моков.

    // Определение начальных тестовых данных (секции и товары)
    const initialSections = [
      { id: 's1', name: 'Фрукты', coords: { x: 10, y: 10, w: 50, h: 50 } },
      { id: 's2', name: 'Овощи', coords: { x: 70, y: 10, w: 50, h: 50 } }
    ];
    const initialProducts = [
      { id: 'p1', name: 'Яблоко', sectionNames: ['Фрукты'] },
      { id: 'p2', name: 'Брокколи', sectionNames: ['Овощи'] }
    ];

    // Установка начального состояния для Preferences и Filesystem.
    setMockPreferences({
      [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences,
      [MAP_SECTIONS_KEY]: JSON.stringify(initialSections),
      [PRODUCTS_KEY]: JSON.stringify(initialProducts)
    });
    setMockFilesystem({
      [mockMapFileUriForPreferences]: mockMapFileContent
    });

    // Оборачиваем шпионы для последующих проверок их вызовов.
    cy.wrap((window as any).exposedSpies.globalWriteFile).as('writeFileSpy');
    cy.wrap((window as any).exposedSpies.globalSetPreference).as('setPreferencesSpy');
    cy.wrap((window as any).exposedSpies.globalToastShow).as('showToastSpy');

    // Переход на страницу оператора с применением моков.
    cy.visit('/tabs/operator', {
      onBeforeLoad: (win) => {
        applyCapacitorMocksToWindow(win);
        // Обеспечиваем наличие базового testState для проверок состояния карты.
        if (!(win as any).testState) { (win as any).testState = { getMapImageSrc: () => mockMapFileContent, getIsDrawing:()=>false, getCurrentRect:()=>null }; }
        Cypress.env('cyCurrentIonicModalOptions', null); // Очистка опций модального окна.
      }
    });

    // Ожидание загрузки и отображения начальных данных на странице.
    cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="section-list-item-s1"]', { timeout: 5000 }).should('contain.text', 'Фрукты');
    cy.get('[data-testid="section-list-item-s2"]', { timeout: 5000 }).should('contain.text', 'Овощи');
    cy.get('[data-testid="product-item-p1"]', { timeout: 5000 }).should('contain.text', 'Яблоко');
    cy.get('[data-testid="product-item-p2"]', { timeout: 5000 }).should('contain.text', 'Брокколи');
  });

  // Тест: проверка возможности удаления товара и сохранения этого изменения.
  it('should allow deleting a product and persist the change', () => {
    // Клик по кнопке удаления товара "Яблоко".
    cy.get('[data-testid="delete-product-button-p1"]').click();

    // Ожидание и обработка модального окна подтверждения удаления.
    cy.wait(100);
    pollForAlertOptionsFromEnv().then((alertOptions: any) => {
      expect(alertOptions.header).to.equal('Подтверждение удаления');
      expect(alertOptions.message).to.include('удалить товар "Яблоко"');
      const deleteButton = alertOptions.buttons.find((b: any) => b.text === 'Удалить');
      expect(deleteButton).to.exist;
      deleteButton.handler(); // Имитация нажатия кнопки "Удалить".
    });

    // Проверка отображения Toast-уведомления об удалении.
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: Cypress.sinon.match(/Товар "Яблоко" удален/) });

    // Проверка, что товар "Яблоко" удален из списка в UI, а "Брокколи" остался.
    cy.get('[data-testid="product-item-p1"]').should('not.exist');
    cy.get('[data-testid="product-item-p2"]').should('exist');
    cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 1);

    // Клик по кнопке "Сохранить Все Изменения".
    cy.get('[data-testid="save-all-button"]').click();
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Все данные успешно сохранены!' });

    // Проверка, что в Preferences сохранился список продуктов, содержащий только "Брокколи".
    cy.get('@setPreferencesSpy').should('have.been.calledWithMatch', Cypress.sinon.match({
      key: PRODUCTS_KEY,
      value: Cypress.sinon.match((value: string) => {
        const products = JSON.parse(value);
        expect(products).to.have.lengthOf(1);
        expect(products[0].name).to.equal('Брокколи');
        return true;
      })
    }));

    // Повторный визит на страницу для проверки персистентности данных после "перезагрузки".
    cy.visit('/tabs/operator', {
      onBeforeLoad: (win) => {
        applyCapacitorMocksToWindow(win);
        if (!(win as any).testState) { (win as any).testState = { getMapImageSrc: () => mockMapFileContent, getIsDrawing:()=>false, getCurrentRect:()=>null }; }
      }
    });
    cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
    // Проверка, что "Яблоко" по-прежнему отсутствует, а "Брокколи" на месте.
    cy.get('[data-testid="product-item-p1"]', { timeout: 5000 }).should('not.exist');
    cy.get('[data-testid="product-item-p2"]', { timeout: 5000 }).should('exist').and('contain.text', 'Брокколи');
    cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 1);
  });

  // Тест: проверка отображения сообщений об ошибках при невалидных действиях пользователя.
  it('should show error toasts for invalid actions', () => {
    // Попытка загрузить не-графический файл как схему магазина.
    cy.writeFile('cypress/fixtures/not_an_image.txt', 'This is not an image').then(() => {
      cy.get('[data-testid="image-file-input"]').selectFile('cypress/fixtures/not_an_image.txt', { force: true });
    });
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Пожалуйста, выберите файл изображения.' });
    // Убеждаемся, что состояние секций и продуктов не изменилось.
    cy.get('[data-testid="defined-sections-list-container"] ul li').should('have.length', 2);
    cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);

    // Попытка загрузить графический файл как список товаров (.txt).
    cy.get('[data-testid="txt-file-input"]').selectFile('cypress/fixtures/test-map.png', { force: true });
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Пожалуйста, выберите файл .txt' });
    cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);

    // Попытка добавить товар с уже существующим именем "Яблоко".
    cy.get('[data-testid="add-product-button"]').click();
    cy.wait(100);
    pollForAlertOptionsFromEnv().then((alertOptions: any) => {
      expect(alertOptions.header).to.equal('Новый товар');
      alertOptions.buttons.find((b: any) => b.text === 'Добавить').handler({ productName: 'Яблоко' }); 
    });
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Товар с именем "Яблоко" уже существует!' });
    cy.get('[data-testid="product-list-container"] [data-testid^="product-item-"]').should('have.length', 2);

    // Попытка добавить секцию с уже существующим именем "Фрукты".
    cy.get('[data-testid="operator-canvas"]')
      .trigger('mousedown', 150, 10, { force: true }) // Рисуем в новом месте.
      .trigger('mousemove', 200, 60, { force: true })
      .trigger('mouseup', { force: true });
    cy.wait(100);
    pollForAlertOptionsFromEnv().then((alertOptions: any) => {
      expect(alertOptions.header).to.equal('Название секции');
      alertOptions.buttons.find((b: any) => b.text === 'ОК').handler({ sectionName: 'Фрукты' });
    });
    cy.get('@showToastSpy').should('have.been.calledWithMatch', { text: 'Секция с именем "Фрукты" уже существует!' });
    cy.get('[data-testid="defined-sections-list-container"] ul li').should('have.length', 2);
  });
});