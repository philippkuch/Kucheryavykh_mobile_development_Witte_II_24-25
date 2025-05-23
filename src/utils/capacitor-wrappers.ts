// src/utils/capacitor-wrappers.ts

// Импорт реальных реализаций плагинов Capacitor и контроллеров Ionic.
// Они будут использоваться, когда приложение запущено не в среде Cypress.
import { Preferences as ActualPreferences, GetResult as PreferencesGetResult, SetOptions as PreferencesSetOptions, RemoveOptions as PreferencesRemoveOptions, KeysResult as PreferencesKeysResult, MigrateResult as PreferencesMigrateResult } from '@capacitor/preferences';
import {
  Filesystem as ActualFilesystem,
  Directory,
  Encoding,
  ReadFileOptions, ReadFileResult, WriteFileOptions, WriteFileResult, AppendFileOptions, DeleteFileOptions, MkdirOptions, RmdirOptions, ReaddirOptions, ReaddirResult, GetUriOptions, GetUriResult, StatOptions, StatResult, RenameOptions, CopyOptions, CheckPermissionsResult, RequestPermissionsResult
} from '@capacitor/filesystem';
import { Toast as ActualToast, ShowOptions as ToastShowOptions } from '@capacitor/toast';
import { alertController as ActualAlertController, actionSheetController as ActualActionSheetController, AlertOptions, ActionSheetOptions } from '@ionic/vue';

// Расширение стандартного интерфейса Window для добавления специфичных для Cypress свойств и мок-функций.
// Это позволяет централизованно управлять доступом к мокам из кода приложения во время тестов.
interface CypressWindow extends Window {
  Cypress?: any; // Флаг, указывающий на запуск в среде Cypress.
  Capacitor?: {
    Plugins?: { // Объект для подмены плагинов Capacitor моками.
      Preferences?: Partial<typeof ActualPreferences>;
      Filesystem?: Partial<typeof ActualFilesystem>;
      Toast?: Partial<typeof ActualToast>;
      [key: string]: any;
    };
  };
  Ionic?: { // Объект для подмены контроллеров Ionic моками.
    alertController?: Partial<typeof ActualAlertController>;
    actionSheetController?: Partial<typeof ActualActionSheetController>;
  };
  // Свойства, через которые Cypress-моки (из capacitor-mocks.ts) делают свои реализации доступными для этого враппера.
  theAppWindowAccessibleGlobalGetPreference?: (options: { key: string; }) => Promise<{ value: string | null; }>;
  theAppWindowAccessibleGlobalReadFile?: (options: ReadFileOptions) => Promise<ReadFileResult>;
  theAppWindowAccessibleGlobalSetPreference?: (options: PreferencesSetOptions) => Promise<void>;
  theAppWindowAccessibleGlobalWriteFile?: (options: WriteFileOptions) => Promise<WriteFileResult>;
  theAppWindowAccessibleGlobalToastShow?: (options: ToastShowOptions) => Promise<void>;
}

// Получаем текущий объект window и приводим его к расширенному типу CypressWindow.
const win = window as CypressWindow;

// Универсальная функция-диспетчер для вызова методов плагинов Capacitor.
// Определяет, запущено ли приложение в среде Cypress, и в зависимости от этого
// вызывает либо мок-реализацию метода, либо его реальную реализацию из плагина.
// P - тип плагина, M - имя метода, Args - типы аргументов, R - тип возвращаемого значения.
const getCapacitorPluginMethod = <P extends Record<string, any>, M extends keyof P, Args extends any[], R>(
  pluginNameOnWindow: keyof NonNullable<NonNullable<CypressWindow['Capacitor']>['Plugins']>, // Имя плагина, как оно будет в win.Capacitor.Plugins
  methodName: M, // Имя вызываемого метода
  ActualPlugin: P  // Ссылка на реальный импортированный плагин
): (...args: Args) => R => {
  const mockPluginGlobal = win.Cypress && win.Capacitor?.Plugins;
  const specificMockPlugin = mockPluginGlobal ? mockPluginGlobal[pluginNameOnWindow] : undefined;
  const mockMethod = specificMockPlugin ? (specificMockPlugin as any)[methodName] : undefined;

  // Если приложение запущено под Cypress и для данного плагина/метода существует мок-функция, используем её.
  if (win.Cypress && mockMethod && typeof mockMethod === 'function') {
    return (...args: Args): R => {
        return mockMethod.apply(specificMockPlugin, args);
    };
  }

  // В противном случае (не Cypress или мок не найден) используем реальную реализацию плагина.
  const actualMethod = (ActualPlugin as any)[methodName];
  if (typeof actualMethod !== 'function') {
      // Критическая ошибка: реальный метод плагина не найден. Это не должно происходить в рабочей сборке.
      return (() => { throw new Error(`Actual method ${String(pluginNameOnWindow)}.${String(methodName)} is undefined`); }) as (...args: Args) => R;
  }
  return actualMethod.bind(ActualPlugin) as (...args: Args) => R; // Привязываем контекст к реальному плагину.
};

// Обертка для плагина Preferences.
// Предоставляет приложению единый API для работы с Preferences, который автоматически
// переключается на моки при запуске в Cypress.
export const AppPreferences = {
  get: (options: { key: string; }): Promise<PreferencesGetResult> => {
    // Проверяем, доступна ли глобальная мок-функция, предоставленная Cypress.
    const globalGetFunc = win.Cypress && win.theAppWindowAccessibleGlobalGetPreference;
    if (globalGetFunc) {
      return globalGetFunc(options); // Используем мок.
    }
    // Если мок недоступен, используем стандартный механизм вызова (который выберет реальный плагин).
    const fallbackGet = getCapacitorPluginMethod<typeof ActualPreferences, 'get', [{ key: string }], Promise<PreferencesGetResult>>('Preferences', 'get', ActualPreferences);
    return fallbackGet(options);
  },
  set: (options: PreferencesSetOptions): Promise<void> => {
    const globalSetFunc = win.Cypress && win.theAppWindowAccessibleGlobalSetPreference;
    if (globalSetFunc) {
        return globalSetFunc(options);
    }
    const fallbackSet = getCapacitorPluginMethod<typeof ActualPreferences, 'set', [PreferencesSetOptions], Promise<void>>('Preferences', 'set', ActualPreferences);
    return fallbackSet(options);
  },
  // Остальные методы Preferences также обернуты для консистентности, даже если они не используют специальную глобальную функцию.
  // Они будут использовать getCapacitorPluginMethod, который сам выберет мок или реальный плагин.
  remove: (options: PreferencesRemoveOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'remove', [PreferencesRemoveOptions], Promise<void>>('Preferences', 'remove', ActualPreferences)(options),
  configure: (): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'configure', [], Promise<void>>('Preferences', 'configure', ActualPreferences)(),
  keys: (): Promise<PreferencesKeysResult> => getCapacitorPluginMethod<typeof ActualPreferences, 'keys', [], Promise<PreferencesKeysResult>>('Preferences', 'keys', ActualPreferences)(),
  clear: (): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'clear', [], Promise<void>>('Preferences', 'clear', ActualPreferences)(),
  migrate: (): Promise<PreferencesMigrateResult> => getCapacitorPluginMethod<typeof ActualPreferences, 'migrate', [], Promise<PreferencesMigrateResult>>('Preferences', 'migrate', ActualPreferences)(),
};

// Обертка для плагина Filesystem.
// Аналогично AppPreferences, предоставляет унифицированный доступ к функциям файловой системы.
export const AppFilesystem = {
  readFile: (options: ReadFileOptions): Promise<ReadFileResult> => {
    const globalReadFileFunc = win.Cypress && win.theAppWindowAccessibleGlobalReadFile;
    if (globalReadFileFunc) {
      return globalReadFileFunc(options);
    }
    const fallbackReadFile = getCapacitorPluginMethod<typeof ActualFilesystem, 'readFile', [ReadFileOptions], Promise<ReadFileResult>>('Filesystem', 'readFile', ActualFilesystem);
    return fallbackReadFile(options);
  },
  writeFile: (options: WriteFileOptions): Promise<WriteFileResult> => {
    const globalWriteFileFunc = win.Cypress && win.theAppWindowAccessibleGlobalWriteFile;
    if (globalWriteFileFunc) {
        return globalWriteFileFunc(options);
    }
    const fallbackWriteFile = getCapacitorPluginMethod<typeof ActualFilesystem, 'writeFile', [WriteFileOptions], Promise<WriteFileResult>>('Filesystem', 'writeFile', ActualFilesystem);
    return fallbackWriteFile(options);
  },
  // Обертки для остальных методов Filesystem.
  appendFile: (options: AppendFileOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'appendFile', [AppendFileOptions], Promise<void>>('Filesystem', 'appendFile', ActualFilesystem)(options),
  deleteFile: (options: DeleteFileOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'deleteFile', [DeleteFileOptions], Promise<void>>('Filesystem', 'deleteFile', ActualFilesystem)(options),
  mkdir: (options: MkdirOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'mkdir', [MkdirOptions], Promise<void>>('Filesystem', 'mkdir', ActualFilesystem)(options),
  rmdir: (options: RmdirOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'rmdir', [RmdirOptions], Promise<void>>('Filesystem', 'rmdir', ActualFilesystem)(options),
  readdir: (options: ReaddirOptions): Promise<ReaddirResult> => getCapacitorPluginMethod<typeof ActualFilesystem, 'readdir', [ReaddirOptions], Promise<ReaddirResult>>('Filesystem', 'readdir', ActualFilesystem)(options),
  getUri: (options: GetUriOptions): Promise<GetUriResult> => getCapacitorPluginMethod<typeof ActualFilesystem, 'getUri', [GetUriOptions], Promise<GetUriResult>>('Filesystem', 'getUri', ActualFilesystem)(options),
  stat: (options: StatOptions): Promise<StatResult> => getCapacitorPluginMethod<typeof ActualFilesystem, 'stat', [StatOptions], Promise<StatResult>>('Filesystem', 'stat', ActualFilesystem)(options),
  rename: (options: RenameOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'rename', [RenameOptions], Promise<void>>('Filesystem', 'rename', ActualFilesystem)(options),
  copy: (options: CopyOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualFilesystem, 'copy', [CopyOptions], Promise<void>>('Filesystem', 'copy', ActualFilesystem)(options),
  checkPermissions: (): Promise<CheckPermissionsResult> => getCapacitorPluginMethod<typeof ActualFilesystem, 'checkPermissions', [], Promise<CheckPermissionsResult>>('Filesystem', 'checkPermissions', ActualFilesystem)(),
  requestPermissions: (): Promise<RequestPermissionsResult> => getCapacitorPluginMethod<typeof ActualFilesystem, 'requestPermissions', [], Promise<RequestPermissionsResult>>('Filesystem', 'requestPermissions', ActualFilesystem)(),
};

// Экспортируем нужные enum'ы из плагина Filesystem для удобства использования в приложении.
export { Directory, Encoding };

// Обертка для плагина Toast.
export const AppToast = {
  show: (options: ToastShowOptions): Promise<void> => {
    const globalToastShowFunc = win.Cypress && win.theAppWindowAccessibleGlobalToastShow;
    if (globalToastShowFunc) {
        return globalToastShowFunc(options);
    }
    const fallbackShow = getCapacitorPluginMethod<typeof ActualToast, 'show', [ToastShowOptions], Promise<void>>('Toast', 'show', ActualToast);
    return fallbackShow(options);
  }
};

// Универсальная функция-диспетчер для вызова методов контроллеров Ionic.
// Работает аналогично getCapacitorPluginMethod, но для контроллеров Ionic (AlertController, ActionSheetController).
// C - тип контроллера, M - имя метода, Args - типы аргументов, R - тип возвращаемого значения.
const getIonicControllerMethod = <C extends Record<string, any>, M extends keyof C, Args extends any[], R>(
  controllerNameOnWindow: keyof NonNullable<CypressWindow['Ionic']>, // Имя контроллера, как оно будет в win.Ionic
  methodName: M,
  ActualController: C
): (...args: Args) => R => {
  const mockController = win.Cypress && win.Ionic ? win.Ionic[controllerNameOnWindow] : undefined;
  const mockMethod = mockController ? (mockController as any)[methodName] : undefined;

  // Если приложение запущено под Cypress и для данного контроллера/метода существует мок, используем его.
  if (win.Cypress && mockMethod && typeof mockMethod === 'function') {
    return mockMethod as (...args: Args) => R; // Мок-метод уже является функцией, готовой к вызову.
  }
  // В противном случае используем реальную реализацию контроллера.
  const actualMethod = (ActualController as any)[methodName];
  if (typeof actualMethod !== 'function') {
    return (() => { throw new Error(`Actual method ${String(controllerNameOnWindow)}.${String(methodName)} is undefined`); }) as (...args: Args) => R;
  }
  return actualMethod.bind(ActualController) as (...args: Args) => R;
};

// Обертка для Ionic AlertController.
export const AppAlertController = {
  create: (options: AlertOptions): Promise<HTMLIonAlertElement> => getIonicControllerMethod<typeof ActualAlertController, 'create', [AlertOptions], Promise<HTMLIonAlertElement>>('alertController', 'create', ActualAlertController)(options),
  dismiss: (data?: any, role?: string | undefined, id?: string | undefined): Promise<boolean> => getIonicControllerMethod<typeof ActualAlertController, 'dismiss', [any?, string?, string?], Promise<boolean>>('alertController', 'dismiss', ActualAlertController)(data, role, id),
  getTop: (): Promise<HTMLIonAlertElement | undefined> => getIonicControllerMethod<typeof ActualAlertController, 'getTop', [], Promise<HTMLIonAlertElement | undefined>>('alertController', 'getTop', ActualAlertController)(),
};

// Обертка для Ionic ActionSheetController.
export const AppActionSheetController = {
  create: (options: ActionSheetOptions): Promise<HTMLIonActionSheetElement> => getIonicControllerMethod<typeof ActualActionSheetController, 'create', [ActionSheetOptions], Promise<HTMLIonActionSheetElement>>('actionSheetController', 'create', ActualActionSheetController)(options),
  dismiss: (data?: any, role?: string | undefined, id?: string | undefined): Promise<boolean> => getIonicControllerMethod<typeof ActualActionSheetController, 'dismiss', [any?, string?, string?], Promise<boolean>>('actionSheetController', 'dismiss', ActualActionSheetController)(data, role, id),
  getTop: (): Promise<HTMLIonActionSheetElement | undefined> => getIonicControllerMethod<typeof ActualActionSheetController, 'getTop', [], Promise<HTMLIonActionSheetElement | undefined>>('actionSheetController', 'getTop', ActualActionSheetController)(),
};