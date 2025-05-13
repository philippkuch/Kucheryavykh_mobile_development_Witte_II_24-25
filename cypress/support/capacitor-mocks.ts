let mockPreferencesStorage: { [key: string]: string | null } = {};
let mockFileSystemStorage: { [path: string]: string } = {};

const _globalCypressFakeSetPreferenceSpy = Cypress.sinon.spy(async function({ key, value }: { key: string; value: string }) {
    mockPreferencesStorage[key] = value;
    return Promise.resolve();
});

const _globalCypressFakeWriteFileSpy = Cypress.sinon.spy(async function({ path, data }: { path: string; data: string; directory?: any; encoding?: any; recursive?: boolean }) {
    mockFileSystemStorage[path] = data;
    return Promise.resolve({ uri: path });
});

const _globalCypressFakeToastShowSpy = Cypress.sinon.spy(async function(options: { text: string; duration?: 'long' | 'short'; position?: string }) {
    Cypress.log({ name: '(Mocked) Toast', message: options.text });
    return Promise.resolve();
});

(window as any).exposedSpies = {
    globalSetPreference: _globalCypressFakeSetPreferenceSpy,
    globalWriteFile: _globalCypressFakeWriteFileSpy,
    globalToastShow: _globalCypressFakeToastShowSpy,
};

(window as any).globalCypressFakeGetPreference = async function({ key }: { key: string }) {
  const valueFromStorage = mockPreferencesStorage[key];
  let finalValue: string | null = null;
  if (typeof valueFromStorage === 'string') {
    finalValue = valueFromStorage;
  } else if (valueFromStorage === null) {
    finalValue = null;
  } else {
    finalValue = null;
  }
  const result = { value: finalValue };
  return Promise.resolve(result);
};

(window as any).globalCypressFakeSetPreference = _globalCypressFakeSetPreferenceSpy;

(window as any).globalCypressFakeReadFile = async function({ path }: { path: string; directory?: any; encoding?: any }) {
  const savedData = mockFileSystemStorage[path];
  if (typeof savedData !== 'undefined') {
    return Promise.resolve({ data: savedData });
  }
  return Promise.reject(new Error(`Mock File not found (global): ${path}`));
};

(window as any).globalCypressFakeWriteFile = _globalCypressFakeWriteFileSpy;

(window as any).globalCypressFakeToastShow = _globalCypressFakeToastShowSpy;

const fakePreferencesImplementation = {
  get: (window as any).globalCypressFakeGetPreference,
  set: (window as any).globalCypressFakeSetPreference,
  remove: async function({ key }: { key: string }) { delete mockPreferencesStorage[key]; return Promise.resolve(); },
  configure: async function() { return Promise.resolve(); },
  keys: async function() { const keysArr = Object.keys(mockPreferencesStorage); return Promise.resolve({ keys: keysArr }); },
  clear: async function() { mockPreferencesStorage = {}; return Promise.resolve(); },
  migrate: async function() { return Promise.resolve({ migrated: [], existing: [] }); }
};

const fakeFilesystemImplementation = {
  readFile: (window as any).globalCypressFakeReadFile,
  writeFile: (window as any).globalCypressFakeWriteFile,
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

const fakeToastImplementation = {
  show: (window as any).globalCypressFakeToastShow
};

const createIonicControllerMock = (winForSpies: Cypress.AUTWindow, controllerName: 'alertController' | 'actionSheetController') => ({
  create: cy.stub().callsFake((options: any) => {
    Cypress.env('cyCurrentIonicModalOptions', options);

    const presentSpy = cy.stub().callsFake(async () => {
      return Promise.resolve();
    });
    const dismissSpy = cy.stub().callsFake(async () => {
      Cypress.env('cyCurrentIonicModalOptions', null);
      return Promise.resolve(true);
    });
    const onDidDismissSpy = cy.stub().callsFake(async () => {
      const buttonRole = options?.buttons?.find((b:any) => b.role === 'confirm' || b.role === 'destructive' || b.role === 'cancel')?.role || 'backdrop';
      return Promise.resolve({ data: undefined, role: buttonRole });
    });

    (winForSpies as any)[`${controllerName}PresentSpy`] = presentSpy;
    (winForSpies as any)[`${controllerName}DismissSpy`] = dismissSpy;
    (winForSpies as any)[`${controllerName}OnDidDismissSpy`] = onDidDismissSpy;

    const mockInstance = {
      present: presentSpy,
      dismiss: dismissSpy,
      onDidDismiss: onDidDismissSpy,
    };
    return Promise.resolve(mockInstance);
  }),
  dismiss: cy.stub().callsFake(async (data?: any, role?: string) => {
    const dismissSpyFromInstance = (winForSpies as any)[`${controllerName}DismissSpy`];
    if (dismissSpyFromInstance && typeof dismissSpyFromInstance.called === 'function') {
        await dismissSpyFromInstance(data, role);
    }
    Cypress.env('cyCurrentIonicModalOptions', null);
    return Promise.resolve(true);
  }),
  getTop: cy.stub().callsFake(async () => {
    if (Cypress.env('cyCurrentIonicModalOptions')) {
      return Promise.resolve({
        dismiss: (winForSpies as any)[`${controllerName}DismissSpy`],
        onDidDismiss: (winForSpies as any)[`${controllerName}OnDidDismissSpy`],
      } as any);
    }
    return Promise.resolve(undefined);
  }),
});

export function applyCapacitorMocksToWindow(win: Cypress.AUTWindow) {
  if (!win.Capacitor) { (win as any).Capacitor = {}; }
  if (!win.Capacitor.Plugins) { win.Capacitor.Plugins = {}; }

  (win as any).theAppWindowAccessibleGlobalGetPreference = (window as any).globalCypressFakeGetPreference;
  (win as any).theAppWindowAccessibleGlobalReadFile = (window as any).globalCypressFakeReadFile;
  (win as any).theAppWindowAccessibleGlobalSetPreference = (window as any).globalCypressFakeSetPreference;
  (win as any).theAppWindowAccessibleGlobalWriteFile = (window as any).globalCypressFakeWriteFile;
  (win as any).theAppWindowAccessibleGlobalToastShow = (window as any).globalCypressFakeToastShow;

  (win.Capacitor.Plugins as any).Preferences = fakePreferencesImplementation;
  (win.Capacitor.Plugins as any).Filesystem = fakeFilesystemImplementation;
  (win.Capacitor.Plugins as any).Toast = fakeToastImplementation;

  if (!(win as any).Ionic) { (win as any).Ionic = {}; }
  const alertControllerMockInstance = createIonicControllerMock(win, 'alertController');
  const actionSheetControllerMockInstance = createIonicControllerMock(win, 'actionSheetController');

  (win as any).Ionic.alertController = alertControllerMockInstance;
  (win as any).Ionic.actionSheetController = actionSheetControllerMockInstance;
}

export function setMockPreferences(prefs: { [key: string]: string | null }) {
  mockPreferencesStorage = { ...prefs };
}
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
export function setMockFilesystem(files: { [path: string]: string }) {
  mockFileSystemStorage = { ...files };
}