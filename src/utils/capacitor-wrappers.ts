import { Preferences as ActualPreferences, GetResult as PreferencesGetResult, SetOptions as PreferencesSetOptions, RemoveOptions as PreferencesRemoveOptions, KeysResult as PreferencesKeysResult, MigrateResult as PreferencesMigrateResult } from '@capacitor/preferences';
import {
  Filesystem as ActualFilesystem,
  Directory,
  Encoding,
  ReadFileOptions, ReadFileResult, WriteFileOptions, WriteFileResult, AppendFileOptions, DeleteFileOptions, MkdirOptions, RmdirOptions, ReaddirOptions, ReaddirResult, GetUriOptions, GetUriResult, StatOptions, StatResult, RenameOptions, CopyOptions, CheckPermissionsResult, RequestPermissionsResult
} from '@capacitor/filesystem';
import { Toast as ActualToast, ShowOptions as ToastShowOptions } from '@capacitor/toast';
import { alertController as ActualAlertController, actionSheetController as ActualActionSheetController, AlertOptions, ActionSheetOptions } from '@ionic/vue';

interface CypressWindow extends Window {
  Cypress?: any;
  Capacitor?: {
    Plugins?: {
      Preferences?: Partial<typeof ActualPreferences>;
      Filesystem?: Partial<typeof ActualFilesystem>;
      Toast?: Partial<typeof ActualToast>;
      [key: string]: any;
    };
  };
  Ionic?: {
    alertController?: Partial<typeof ActualAlertController>;
    actionSheetController?: Partial<typeof ActualActionSheetController>;
  };
  theAppWindowAccessibleGlobalGetPreference?: (options: { key: string; }) => Promise<{ value: string | null; }>;
  theAppWindowAccessibleGlobalReadFile?: (options: ReadFileOptions) => Promise<ReadFileResult>;
  theAppWindowAccessibleGlobalSetPreference?: (options: PreferencesSetOptions) => Promise<void>;
  theAppWindowAccessibleGlobalWriteFile?: (options: WriteFileOptions) => Promise<WriteFileResult>;
  theAppWindowAccessibleGlobalToastShow?: (options: ToastShowOptions) => Promise<void>;
}

const win = window as CypressWindow;

const getCapacitorPluginMethod = <P extends Record<string, any>, M extends keyof P, Args extends any[], R>(
  pluginNameOnWindow: keyof NonNullable<NonNullable<CypressWindow['Capacitor']>['Plugins']>,
  methodName: M,
  ActualPlugin: P
): (...args: Args) => R => {
  const mockPluginGlobal = win.Cypress && win.Capacitor?.Plugins;
  const specificMockPlugin = mockPluginGlobal ? mockPluginGlobal[pluginNameOnWindow] : undefined;
  const mockMethod = specificMockPlugin ? (specificMockPlugin as any)[methodName] : undefined;

  if (win.Cypress && mockMethod && typeof mockMethod === 'function') {
    return (...args: Args): R => {
        return mockMethod.apply(specificMockPlugin, args);
    };
  }

  const actualMethod = (ActualPlugin as any)[methodName];
  if (typeof actualMethod !== 'function') {
      return (() => { throw new Error(`Actual method ${String(pluginNameOnWindow)}.${String(methodName)} is undefined`); }) as (...args: Args) => R;
  }
  return actualMethod.bind(ActualPlugin) as (...args: Args) => R;
};

export const AppPreferences = {
  get: (options: { key: string; }): Promise<PreferencesGetResult> => {
    const globalGetFunc = win.Cypress && win.theAppWindowAccessibleGlobalGetPreference;
    if (globalGetFunc) {
      return globalGetFunc(options);
    }
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
  remove: (options: PreferencesRemoveOptions): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'remove', [PreferencesRemoveOptions], Promise<void>>('Preferences', 'remove', ActualPreferences)(options),
  configure: (): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'configure', [], Promise<void>>('Preferences', 'configure', ActualPreferences)(),
  keys: (): Promise<PreferencesKeysResult> => getCapacitorPluginMethod<typeof ActualPreferences, 'keys', [], Promise<PreferencesKeysResult>>('Preferences', 'keys', ActualPreferences)(),
  clear: (): Promise<void> => getCapacitorPluginMethod<typeof ActualPreferences, 'clear', [], Promise<void>>('Preferences', 'clear', ActualPreferences)(),
  migrate: (): Promise<PreferencesMigrateResult> => getCapacitorPluginMethod<typeof ActualPreferences, 'migrate', [], Promise<PreferencesMigrateResult>>('Preferences', 'migrate', ActualPreferences)(),
};

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

export { Directory, Encoding };

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

const getIonicControllerMethod = <C extends Record<string, any>, M extends keyof C, Args extends any[], R>(
  controllerNameOnWindow: keyof NonNullable<CypressWindow['Ionic']>,
  methodName: M,
  ActualController: C
): (...args: Args) => R => {
  const mockController = win.Cypress && win.Ionic ? win.Ionic[controllerNameOnWindow] : undefined;
  const mockMethod = mockController ? (mockController as any)[methodName] : undefined;

  if (win.Cypress && mockMethod && typeof mockMethod === 'function') {
    return mockMethod as (...args: Args) => R;
  }
  const actualMethod = (ActualController as any)[methodName];
  if (typeof actualMethod !== 'function') {
    return (() => { throw new Error(`Actual method ${String(controllerNameOnWindow)}.${String(methodName)} is undefined`); }) as (...args: Args) => R;
  }
  return actualMethod.bind(ActualController) as (...args: Args) => R;
};

export const AppAlertController = {
  create: (options: AlertOptions): Promise<HTMLIonAlertElement> => getIonicControllerMethod<typeof ActualAlertController, 'create', [AlertOptions], Promise<HTMLIonAlertElement>>('alertController', 'create', ActualAlertController)(options),
  dismiss: (data?: any, role?: string | undefined, id?: string | undefined): Promise<boolean> => getIonicControllerMethod<typeof ActualAlertController, 'dismiss', [any?, string?, string?], Promise<boolean>>('alertController', 'dismiss', ActualAlertController)(data, role, id),
  getTop: (): Promise<HTMLIonAlertElement | undefined> => getIonicControllerMethod<typeof ActualAlertController, 'getTop', [], Promise<HTMLIonAlertElement | undefined>>('alertController', 'getTop', ActualAlertController)(),
};

export const AppActionSheetController = {
  create: (options: ActionSheetOptions): Promise<HTMLIonActionSheetElement> => getIonicControllerMethod<typeof ActualActionSheetController, 'create', [ActionSheetOptions], Promise<HTMLIonActionSheetElement>>('actionSheetController', 'create', ActualActionSheetController)(options),
  dismiss: (data?: any, role?: string | undefined, id?: string | undefined): Promise<boolean> => getIonicControllerMethod<typeof ActualActionSheetController, 'dismiss', [any?, string?, string?], Promise<boolean>>('actionSheetController', 'dismiss', ActualActionSheetController)(data, role, id),
  getTop: (): Promise<HTMLIonActionSheetElement | undefined> => getIonicControllerMethod<typeof ActualActionSheetController, 'getTop', [], Promise<HTMLIonActionSheetElement | undefined>>('actionSheetController', 'getTop', ActualActionSheetController)(),
};