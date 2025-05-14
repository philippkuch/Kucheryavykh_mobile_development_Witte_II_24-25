// Импорт утилит для управления моками плагинов Capacitor.
// Эти утилиты позволяют нам симулировать различное состояние хранилища
// и файловой системы для тестирования разных сценариев работы страницы карты.
import {
  setMockPreferences,
  setMockFilesystem,
  applyCapacitorMocksToWindow,
  resetCapacitorMocks
} from '../support/capacitor-mocks';

// Константы для ключей хранения данных и имен файлов, используемые в тестах
// для согласованности с приложением.
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts'; // Используется для полноты данных, хотя напрямую не проверяется в этих тестах.
const SAVED_MAP_FILENAME = 'storeMapImage.txt';
// Мок URI файла карты и его содержимого (минимальное валидное изображение).
const mockMapFileUriForPreferences = `mock://filesystem/DATA/${SAVED_MAP_FILENAME}`;
const mockMapFileContent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Тестовый набор для проверки поведения страницы карты при прямой навигации и в ошибочных состояниях.
describe('Map Page - Direct Navigation and Error States', () => {

  // Тестовые данные для секций и продуктов, используемые для настройки моков Preferences.
  const testSections = [
    { id: 's1', name: 'Dairy', coords: { x: 10, y: 10, w: 50, h: 50 } },
    { id: 's2', name: 'Bakery', coords: { x: 70, y: 10, w: 50, h: 50 } },
    { id: 's3', name: 'Produce', coords: { x: 10, y: 70, w: 50, h: 50 } }
  ];
  const testProducts = [
    { id: 'p1', name: 'Milk', sectionNames: ['Dairy'] },
    { id: 'p2', name: 'Bread', sectionNames: ['Bakery'] }
  ];

  // Хук beforeEach выполняется перед каждым тестом, сбрасывая состояние моков.
  // Это гарантирует, что каждый тест начинается с чистого и предсказуемого состояния.
  beforeEach(() => {
    resetCapacitorMocks();
  });

  // Тест: проверка подсветки нескольких секций при прямой навигации с соответствующими query-параметрами.
  it('should highlight multiple sections when navigated directly with query params', () => {
    // Настройка моков: полные данные о секциях, продуктах, URI карты и содержимом файла карты.
    setMockPreferences({
      [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
      [PRODUCTS_KEY]: JSON.stringify(testProducts),
      [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
    });
    setMockFilesystem({
      [mockMapFileUriForPreferences]: mockMapFileContent
    });

    // Прямой переход на страницу карты с указанием секций 'Dairy' и 'Bakery' для подсветки.
    cy.visit('/tabs/map?sections=Dairy|Bakery', {
      onBeforeLoad: applyCapacitorMocksToWindow // Применение моков перед загрузкой приложения.
    });

    // Ожидание завершения загрузки карты.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-container"]').should('be.visible'); // Контейнер карты должен быть видим.

    // Проверка, что указанные секции подсвечены (зеленым цветом).
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Dairy-highlighted"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'green');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Bakery-highlighted"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'green');
    // Проверка, что другая секция не подсвечена (серым цветом).
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Produce"]', { timeout: 5000 }).should('exist').and('have.attr', 'stroke', 'grey');

    // Проверка информационной панели: список результатов поиска должен отсутствовать,
    // но должна отображаться информация о подсвеченных секциях.
    cy.get('[data-testid="results-list"]').should('not.exist');
    cy.get('[data-testid="highlight-info"]')
      .should('be.visible')
      .and('contain.text', 'Подсвечены секции: Dairy, Bakery');
  });

  // Тест: проверка подсветки одной секции при прямой навигации.
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
    // Проверка, что только секция 'Produce' подсвечена.
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Produce-highlighted"]', { timeout: 5000 }).should('exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Dairy"]', { timeout: 5000 }).should('exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid="section-rect-Bakery"]', { timeout: 5000 }).should('exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]').should('have.length', 1); // Убеждаемся, что подсвечена только одна секция.

    cy.get('[data-testid="highlight-info"]')
      .should('be.visible')
      .and('contain.text', 'Подсвечены секции: Produce');
  });

  // Тест: проверка состояния карты по умолчанию (без подсветки) при навигации без query-параметров.
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
    // Проверка отсутствия подсвеченных секций и наличия всех определенных секций в стандартном стиле.
    cy.get('[data-testid="map-svg-overlay"] [data-testid*="-highlighted"]', { timeout: 5000 }).should('not.exist');
    cy.get('[data-testid="map-svg-overlay"] [data-testid^="section-rect-"]', { timeout: 5000 }).should('have.length', 3);

    // Информационная панель должна содержать сообщение по умолчанию.
    cy.get('[data-testid="results-list"]').should('not.exist');
    cy.get('[data-testid="highlight-info"]').should('not.exist');
    cy.get('[data-testid="no-search-info"]')
      .should('be.visible')
      .and('contain.text', 'Для отображения списка "Товар-Секция" найдите товары через Поиск.');
  });

  // Тест: проверка отображения плейсхолдера ошибки, если файл изображения карты отсутствует в хранилище,
  // но URI на него присутствует в Preferences.
  it('should show map error placeholder if map image file is missing from storage', () => {
    // Настройка моков: есть URI карты, но нет соответствующего файла в Filesystem.
    setMockPreferences({
      [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
      [PRODUCTS_KEY]: JSON.stringify(testProducts),
      [MAP_IMAGE_URI_KEY]: mockMapFileUriForPreferences
    });
    setMockFilesystem({}); // Файловая система пуста.

    cy.visit('/tabs/map', { onBeforeLoad: applyCapacitorMocksToWindow });

    // Ожидаем отображение плейсхолдера ошибки.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-error-placeholder"]', { timeout: 5000 })
      .should('be.visible')
      .and('contain.text', 'Не удалось загрузить карту');
  });

  // Тест: проверка отображения плейсхолдера ошибки, если URI изображения карты отсутствует в Preferences.
  it('should show map error placeholder if map URI is missing from preferences', () => {
    // Настройка моков: URI карты не задан (null).
    setMockPreferences({
      [MAP_SECTIONS_KEY]: JSON.stringify(testSections),
      [PRODUCTS_KEY]: JSON.stringify(testProducts),
      [MAP_IMAGE_URI_KEY]: null
    });
    setMockFilesystem({}); // Состояние файловой системы не имеет значения в данном случае.

    cy.visit('/tabs/map', { onBeforeLoad: applyCapacitorMocksToWindow });

    // Ожидаем отображение плейсхолдера ошибки.
    cy.get('[data-testid="map-loading-placeholder"]', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="map-error-placeholder"]', { timeout: 5000 })
      .should('be.visible')
      .and('contain.text', 'Не удалось загрузить карту');
  });

});