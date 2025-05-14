// Хранилища для имитации работы Capacitor Preferences и Filesystem в браузере во время тестов.
// Позволяют контролировать данные, которые приложение будет "читать" и "записывать".
let mockPreferencesStorage: { [key: string]: string | null } = {};
let mockFileSystemStorage: { [path: string]: string } = {};

// Создание шпионов (spies) с помощью Cypress.sinon.spy для отслеживания вызовов
// и аргументов функций, имитирующих запись данных.
// Это позволяет в тестах проверять, что методы сохранения были вызваны корректно.

// Шпион для имитации функции Preferences.set(). Сохраняет значение в mockPreferencesStorage.
const _globalCypressFakeSetPreferenceSpy = Cypress.sinon.spy(async function({ key, value }: { key: string; value: string }) {
    mockPreferencesStorage[key] = value;
    return Promise.resolve();
});

// Шпион для имитации функции Filesystem.writeFile(). Сохраняет данные в mockFileSystemStorage.
const _globalCypressFakeWriteFileSpy = Cypress.sinon.spy(async function({ path, data }: { path: string; data: string; directory?: any; encoding?: any; recursive?: boolean }) {
    mockFileSystemStorage[path] = data;
    // Возвращает объект с URI, как это делает реальный плагин.
    return Promise.resolve({ uri: path });
});

// Шпион для имитации функции Toast.show(). Логирует сообщение в Cypress Command Log для наглядности.
const _globalCypressFakeToastShowSpy = Cypress.sinon.spy(async function(options: { text: string; duration?: 'long' | 'short'; position?: string }) {
    Cypress.log({ name: '(Mocked) Toast', message: options.text });
    return Promise.resolve();
});

// Объект, предоставляющий доступ к шпионам из тестовых файлов.
// Тесты могут использовать cy.get('@spyName') для проверки вызовов этих шпионов.
(window as any).exposedSpies = {
    globalSetPreference: _globalCypressFakeSetPreferenceSpy,
    globalWriteFile: _globalCypressFakeWriteFileSpy,
    globalToastShow: _globalCypressFakeToastShowSpy,
};

// Глобальные функции, имитирующие методы плагинов Capacitor.
// Эти функции будут доступны в контексте приложения (AUT) через applyCapacitorMocksToWindow.

// Имитация Preferences.get(). Читает значение из mockPreferencesStorage.
(window as any).globalCypressFakeGetPreference = async function({ key }: { key: string }) {
  const valueFromStorage = mockPreferencesStorage[key];
  let finalValue: string | null = null;
  if (typeof valueFromStorage === 'string') {
    finalValue = valueFromStorage;
  } else if (valueFromStorage === null) {
    finalValue = null;
  } else { // undefined (ключ не найден)
    finalValue = null;
  }
  const result = { value: finalValue };
  return Promise.resolve(result);
};
// Имитация Preferences.set() использует ранее определенный шпион.
(window as any).globalCypressFakeSetPreference = _globalCypressFakeSetPreferenceSpy;

// Имитация Filesystem.readFile(). Читает данные из mockFileSystemStorage.
(window as any).globalCypressFakeReadFile = async function({ path }: { path: string; directory?: any; encoding?: any }) {
  const savedData = mockFileSystemStorage[path];
  if (typeof savedData !== 'undefined') {
    return Promise.resolve({ data: savedData });
  }
  // Если файл не найден, отклоняем Promise с ошибкой, имитируя поведение плагина.
  return Promise.reject(new Error(`Mock File not found (global): ${path}`));
};
// Имитация Filesystem.writeFile() использует ранее определенный шпион.
(window as any).globalCypressFakeWriteFile = _globalCypressFakeWriteFileSpy;

// Имитация Toast.show() использует ранее определенный шпион.
(window as any).globalCypressFakeToastShow = _globalCypressFakeToastShowSpy;


// Объекты, имитирующие API плагинов Capacitor.
// Они содержат ссылки на функции-моки и используются для подмены реальных плагинов.

// Имплементация-мок для плагина Preferences.
const fakePreferencesImplementation = {
  get: (window as any).globalCypressFakeGetPreference,
  set: (window as any).globalCypressFakeSetPreference,
  remove: async function({ key }: { key: string }) { delete mockPreferencesStorage[key]; return Promise.resolve(); },
  configure: async function() { return Promise.resolve(); }, // Базовые заглушки для остальных методов.
  keys: async function() { const keysArr = Object.keys(mockPreferencesStorage); return Promise.resolve({ keys: keysArr }); },
  clear: async function() { mockPreferencesStorage = {}; return Promise.resolve(); },
  migrate: async function() { return Promise.resolve({ migrated: [], existing: [] }); }
};

// Имплементация-мок для плагина Filesystem.
const fakeFilesystemImplementation = {
  readFile: (window as any).globalCypressFakeReadFile,
  writeFile: (window as any).globalCypressFakeWriteFile,
  // Для методов, не используемых активно в тестах, предоставлены простые заглушки.
  appendFile: async () => { return Promise.resolve(); },
  deleteFile: async (options: any) => { delete mockFileSystemStorage[options.path]; return Promise.resolve(); },
  mkdir: async (options: any) => { return Promise.resolve({uri: options.path}); },
  rmdir: async () => { return Promise.resolve(); },
  readdir: async () => { return Promise.resolve({files: []}); },
  getUri: async (options: any) => { return Promise.resolve({uri: options.path}); },
  stat: async (options: any) => { return Promise.resolve({type: 'file', size: 0, ctime:Date.now(), mtime: Date.now(), uri: options.path }); },
  rename: async () => { return Promise.resolve(); },
  copy: async (options: any) => { return Promise.resolve({uri: options.to}); },
  checkPermissions: async () => { return Promise.resolve({publicStorage: 'granted'}); },
  requestPermissions: async () => { return Promise.resolve({publicStorage: 'granted'}); },
};

// Имплементация-мок для плагина Toast.
const fakeToastImplementation = {
  show: (window as any).globalCypressFakeToastShow
};

// Функция для создания мока контроллеров Ionic (AlertController, ActionSheetController).
// Это ключевой механизм для тестирования UI, который использует модальные окна Ionic.
const createIonicControllerMock = (winForSpies: Cypress.AUTWindow, controllerName: 'alertController' | 'actionSheetController') => ({
  // Имитация метода .create() контроллера.
  create: cy.stub().callsFake((options: any) => {
    // Сохраняем опции алерта/экшн-шита в переменную окружения Cypress.
    // Это позволяет тестам получить доступ к этим опциям (например, для вызова обработчиков кнопок).
    Cypress.env('cyCurrentIonicModalOptions', options);

    // Создаем шпионы для методов экземпляра модального окна (present, dismiss, onDidDismiss).
    const presentSpy = cy.stub().callsFake(async () => {
      return Promise.resolve();
    });
    const dismissSpy = cy.stub().callsFake(async () => {
      Cypress.env('cyCurrentIonicModalOptions', null); // Очищаем опции при закрытии.
      return Promise.resolve(true);
    });
    const onDidDismissSpy = cy.stub().callsFake(async () => {
      // Имитируем возврат роли кнопки, которая была бы "нажата".
      const buttonRole = options?.buttons?.find((b:any) => b.role === 'confirm' || b.role === 'destructive' || b.role === 'cancel')?.role || 'backdrop';
      return Promise.resolve({ data: undefined, role: buttonRole });
    });

    // Делаем шпионы экземпляра доступными в окне приложения для возможных проверок в тестах.
    (winForSpies as any)[`${controllerName}PresentSpy`] = presentSpy;
    (winForSpies as any)[`${controllerName}DismissSpy`] = dismissSpy;
    (winForSpies as any)[`${controllerName}OnDidDismissSpy`] = onDidDismissSpy;

    // Возвращаем объект, имитирующий экземпляр модального окна.
    const mockInstance = {
      present: presentSpy,
      dismiss: dismissSpy,
      onDidDismiss: onDidDismissSpy,
    };
    return Promise.resolve(mockInstance);
  }),
  // Имитация статического метода .dismiss() контроллера.
  dismiss: cy.stub().callsFake(async (data?: any, role?: string) => {
    const dismissSpyFromInstance = (winForSpies as any)[`${controllerName}DismissSpy`];
    if (dismissSpyFromInstance && typeof dismissSpyFromInstance.called === 'function') {
        await dismissSpyFromInstance(data, role);
    }
    Cypress.env('cyCurrentIonicModalOptions', null);
    return Promise.resolve(true);
  }),
  // Имитация статического метода .getTop() контроллера.
  getTop: cy.stub().callsFake(async () => {
    if (Cypress.env('cyCurrentIonicModalOptions')) { // Если есть активное модальное окно (по мнению мока).
      return Promise.resolve({
        dismiss: (winForSpies as any)[`${controllerName}DismissSpy`],
        onDidDismiss: (winForSpies as any)[`${controllerName}OnDidDismissSpy`],
      } as any);
    }
    return Promise.resolve(undefined);
  }),
});

// Основная функция, применяющая все моки к окну тестируемого приложения (AUT).
// Вызывается в хуке onBeforeLoad при cy.visit().
export function applyCapacitorMocksToWindow(win: Cypress.AUTWindow) {
  // Гарантируем существование объектов Capacitor и Capacitor.Plugins в окне приложения.
  if (!win.Capacitor) { (win as any).Capacitor = {}; }
  if (!win.Capacitor.Plugins) { win.Capacitor.Plugins = {}; }

  // Прокидываем глобальные функции-моки в окно приложения, чтобы capacitor-wrappers.ts мог их найти.
  // Имена свойств здесь должны совпадать с теми, которые ожидает capacitor-wrappers.ts.
  (win as any).theAppWindowAccessibleGlobalGetPreference = (window as any).globalCypressFakeGetPreference;
  (win as any).theAppWindowAccessibleGlobalReadFile = (window as any).globalCypressFakeReadFile;
  (win as any).theAppWindowAccessibleGlobalSetPreference = (window as any).globalCypressFakeSetPreference;
  (win as any).theAppWindowAccessibleGlobalWriteFile = (window as any).globalCypressFakeWriteFile;
  (win as any).theAppWindowAccessibleGlobalToastShow = (window as any).globalCypressFakeToastShow;

  // Подменяем реальные плагины Capacitor на их мок-имплементации.
  (win.Capacitor.Plugins as any).Preferences = fakePreferencesImplementation;
  (win.Capacitor.Plugins as any).Filesystem = fakeFilesystemImplementation;
  (win.Capacitor.Plugins as any).Toast = fakeToastImplementation;

  // Подменяем реальные контроллеры Ionic на их моки.
  if (!(win as any).Ionic) { (win as any).Ionic = {}; }
  const alertControllerMockInstance = createIonicControllerMock(win, 'alertController');
  const actionSheetControllerMockInstance = createIonicControllerMock(win, 'actionSheetController');

  (win as any).Ionic.alertController = alertControllerMockInstance;
  (win as any).Ionic.actionSheetController = actionSheetControllerMockInstance;
}

// Вспомогательные функции для управления состоянием моков из тестов.

// Устанавливает начальное состояние для mockPreferencesStorage.
export function setMockPreferences(prefs: { [key: string]: string | null }) {
  mockPreferencesStorage = { ...prefs };
}
// Сбрасывает все моки к начальному состоянию перед каждым тестом.
// Очищает хранилища, состояние модальных окон и историю вызовов шпионов.
export function resetCapacitorMocks() {
  mockPreferencesStorage = {};
  mockFileSystemStorage = {};
  Cypress.env('cyCurrentIonicModalOptions', null);
  if ((window as any).exposedSpies) {
    (window as any).exposedSpies.globalSetPreference.resetHistory();
    (window as any).exposedSpies.globalWriteFile.resetHistory();
    (window as any).exposedSpies.globalToastShow.resetHistory();
  }
}
// Устанавливает начальное состояние для mockFileSystemStorage.
export function setMockFilesystem(files: { [path: string]: string }) {
  mockFileSystemStorage = { ...files };
}