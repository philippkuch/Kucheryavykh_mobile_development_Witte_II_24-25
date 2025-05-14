// Импорт вспомогательных функций для управления моками Capacitor плагинов.
// Эти функции позволяют нам контролировать данные, которые приложение получает от "нативных" частей,
// и таким образом создавать предсказуемые условия для тестирования.
import { setMockPreferences, setMockFilesystem, applyCapacitorMocksToWindow, resetCapacitorMocks } from '../support/capacitor-mocks';

// Константы, используемые для ключей в Preferences и имен файлов,
// обеспечивают консистентность между тестами и кодом приложения.
const PRODUCTS_KEY = 'storeProducts';
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';

// Тестовые данные для имитации сохраненных продуктов.
const testProducts = [
  { id: 'p1', name: 'Чипсы Lays', sectionNames: ['Бакалея'] },
  { id: 'p2', name: 'Кола', sectionNames: ['Напитки'] },
  { id: 'p3', name: 'Вода Святой Источник', sectionNames: [] } // Товар без назначенных секций.
];
// Тестовые данные для имитации сохраненных секций магазина.
const testSections = [
  { id: 's1', name: 'Бакалея', coords: { x: 10, y: 10, w: 50, h: 50 } },
  { id: 's2', name: 'Напитки', coords: { x: 70, y: 10, w: 50, h: 50 } }
];
// Мок URI для файла карты, который будет использоваться в Preferences.
const mockMapFileUriForPreferences = `mock://filesystem/DATA/${SAVED_MAP_FILENAME}`;
// Мок содержимого файла карты (минимально валидное изображение в base64).
const mockMapFileContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Описание тестового набора для сценариев поиска товаров пользователем.
describe('Customer Search Flow', () => {
  // Хук beforeEach выполняется перед каждым тестом в этом describe блоке.
  // Используется для подготовки начального состояния моков и загрузки страницы поиска.
  beforeEach(() => {
    resetCapacitorMocks(); // Сброс состояния всех моков для изоляции тестов.
    // Настройка начального состояния Preferences с тестовыми данными.
    setMockPreferences({
      [PRODUCTS_KEY]: JSON.stringify(testProducts),
      [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences,
      [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
    });
    // Настройка начального состояния файловой системы с моком файла карты.
    setMockFilesystem({
      [mockMapFileUriForPreferences]: mockMapFileContent
    });

    // Переход на страницу поиска (/tabs/search).
    // В хуке onBeforeLoad применяются моки к окну приложения.
    cy.visit('/tabs/search', {
      onBeforeLoad: (win) => {
        applyCapacitorMocksToWindow(win); // Активация моков Capacitor и Ionic.
        (win as any).Cypress = Cypress; // Делаем объект Cypress доступным в окне приложения для его нужд.
      }
    });
    // Ожидание завершения начальной загрузки данных на странице.
    cy.get('[data-testid="loading-indicator"]', { timeout: 10000 }).should('not.exist');
    // Проверка видимости ключевых элементов интерфейса.
    cy.get('[data-testid="search-input"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-testid="list-input-section"]', { timeout: 5000 }).should('be.visible');
    cy.wait(500, { log: true }); // Небольшая пауза для стабилизации UI.
  });

  // Тест: поиск одного товара через поисковую строку, выбор из подсказок,
  // переход на карту и проверка подсветки соответствующей секции.
  it('should find a product using search bar, show suggestions, navigate to map and highlight section', () => {
    // Ввод текста в поисковую строку.
    cy.get('[data-testid="search-input"] input').type('Чипс', { force: true });
    cy.wait(300, {log: true}); // Ожидание debounce и появления подсказок.
    cy.get('[data-testid="suggestions-list"]', { timeout: 7000 }).should('be.visible');
    // Выбор конкретной подсказки.
    cy.get('[data-testid="suggestions-list"] [data-testid="suggestion-item-p1"]', { timeout: 5000 })
      .should('be.visible')
      .and('contain.text', 'Чипсы Lays')
      .click();

    // Проверка URL и параметров навигации на страницу карты.
    cy.url({ timeout: 6000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        expect(params.get('sections')).to.eq('Бакалея'); // Ожидаем параметр секции.
    });

    // Проверка состояния страницы карты: загрузка завершена, секция подсвечена.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Бакалея-highlighted"]', { timeout: 7000 })
      .should('exist').and('have.attr', 'stroke', 'green');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Напитки"]') // Другая секция не подсвечена.
      .should('exist').and('have.attr', 'stroke', 'grey');
    // Проверка отображения информации о найденном товаре.
    cy.get('[data-testid="results-info-container"] [data-testid="result-info-item-Чипсы Lays"]')
      .should('be.visible').and('contain.text', 'Секции: Бакалея');
  });

  // Тест: поиск товара, для которого не заданы секции.
  // Проверяется, что приложение корректно обрабатывает этот случай.
  it('should handle search for product with no sections assigned', () => {
    cy.get('[data-testid="search-input"] input').type('Вода Святой', { force: true });
    cy.wait(300, {log: true});
    cy.get('[data-testid="suggestions-list"]', { timeout: 7000 }).should('be.visible');
    cy.get('[data-testid="suggestions-list"] [data-testid="suggestion-item-p3"]', { timeout: 5000 })
      .should('be.visible')
      .contains('Вода Святой Источник')
      .click();

    // Проверка URL: параметр sections должен отсутствовать или быть пустым.
    cy.url({ timeout: 6000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        expect(params.get('sections')).to.be.null;
    });
    // На карте не должно быть подсвеченных секций.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]', { timeout: 5000 }).should('not.exist');
    // В информации о товаре должно быть указано, что расположение не задано.
    cy.get('[data-testid="results-info-container"] [data-testid="result-info-item-Вода Святой Источник"]')
      .should('be.visible')
      .should('contain.text', 'Расположение не указано');
  });

  // Тест: поиск несуществующего товара.
  // Проверяется отображение сообщения "ничего не найдено".
  it('should handle search for non-existent product', () => {
    cy.get('[data-testid="search-input"] input').type('ФантастическийТовар', { force: true });
    cy.wait(300, {log: true});
    // Список подсказок не должен появиться.
    cy.get('[data-testid="suggestions-list"]', { timeout: 1000 }).should('not.exist');
    // Должно отобразиться сообщение об отсутствии результатов.
    cy.get('[data-testid="search-results-list"] [data-testid="no-results-message"]')
      .should('be.visible')
      .and('contain.text', 'По запросу "ФантастическийТовар" ничего не найдено.');
    // Пользователь должен остаться на странице поиска.
    cy.url().should('include', '/tabs/search');
  });

  // Тест: поиск нескольких товаров через ввод списком в textarea.
  // Проверяется корректная обработка списка, включая несуществующие товары,
  // и подсветка всех релевантных секций на карте.
  it('should find multiple products from list and highlight sections on map', () => {
    const productList = "Чипсы Lays\nНесуществующийТоварИзСписка\nКола"; // Список содержит существующие и несуществующий товар.
    cy.get('[data-testid="list-input"] textarea').type(productList, { force: true });
    cy.get('[data-testid="find-from-list-button"]').click();

    // Проверка URL и параметров навигации (ожидаются секции для "Чипсы Lays" и "Кола").
    cy.url({ timeout: 7000 }).should('include', '/tabs/map');
    cy.location().should((loc) => {
        expect(loc.pathname).to.eq('/tabs/map');
        const params = new URLSearchParams(loc.search);
        const sectionsValue = params.get('sections');
        expect(sectionsValue).to.not.be.null;
        if (sectionsValue) { // Проверка, что переданы обе ожидаемые секции.
            const sectionsArray = sectionsValue.split('|').sort();
            expect(sectionsArray).to.deep.eq(['Бакалея', 'Напитки'].sort());
        }
    });
    // Проверка состояния карты: подсветка двух секций.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Бакалея-highlighted"]', { timeout: 7000 }).should('exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Напитки-highlighted"]', { timeout: 7000 }).should('exist');
    // Проверка отображения информации о всех товарах из списка.
    cy.get('[data-testid="results-info-container"] [data-testid="results-list"] ion-item').should('have.length', 3);
    cy.get('[data-testid="result-info-item-Чипсы Lays"]').should('contain.text', 'Секции: Бакалея');
    cy.get('[data-testid="result-info-item-НесуществующийТоварИзСписка"]').should('contain.text', 'Товар не найден');
    cy.get('[data-testid="result-info-item-Кола"]').should('contain.text', 'Секции: Напитки');
  });
});