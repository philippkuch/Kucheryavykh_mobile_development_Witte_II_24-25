<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Панель Оператора</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true" class="ion-padding">

      <ion-button expand="block" @click="triggerImageFileUpload" data-testid="load-image-button">
        <ion-icon slot="start" :icon="cloudUploadOutline"></ion-icon>
        Загрузить Схему Магазина (Картинка)
      </ion-button>
      <input
        type="file"
        accept="image/*"
        ref="imageFileInputRef"
        @change="handleImageFileChange"
        style="display: none;"
        data-testid="image-file-input" />

      <div class="map-editor-container ion-margin-top">
        <canvas
          ref="canvasRef"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
          @touchstart.prevent="handleTouchStart"
          @touchmove.prevent="handleTouchMove"
          @touchend.prevent="handleTouchEnd"
          style="border: 1px solid grey; max-width: 100%; height: auto;"
          data-testid="operator-canvas" ></canvas>
      </div>

      <div data-testid="defined-sections-list-container"> <h3>Определенные секции:</h3>
        <ul v-if="sections.length > 0">
            <li v-for="(section) in sections" :key="section.id" :data-testid="`section-list-item-${section.id}`">
              {{ section.name }} ({{ section.coords.x }}, {{ section.coords.y }}, {{ section.coords.w }}x{{ section.coords.h }})
            </li>
        </ul>
        <p data-testid="no-sections-message" v-else>Секции еще не добавлены.</p> </div>

      <ion-button
        expand="block"
        color="success"
        class="ion-margin-top"
        :disabled="!mapImageSrc && sections.length === 0 && products.length === 0"
        @click="saveData"
        data-testid="save-all-button" >
        <ion-icon slot="start" :icon="saveOutline"></ion-icon>
        Сохранить Все Изменения
      </ion-button>

      <hr style="margin: 20px 0;">

      <ion-list lines="inset" class="ion-margin-top" data-testid="product-list-container"> <ion-list-header>
          <ion-label>Управление Товарами</ion-label>
          <ion-button
            @click="triggerTxtFileUpload"
            fill="clear"
            size="small"
            title="Загрузить список товаров из .txt"
            data-testid="load-txt-button" >
            <ion-icon slot="icon-only" :icon="documentTextOutline"></ion-icon>
          </ion-button>
          <ion-button
            @click="promptForNewProduct"
            fill="clear"
            size="small"
            title="Добавить товар вручную"
            data-testid="add-product-button" >
            <ion-icon slot="icon-only" :icon="addCircleOutline"></ion-icon>
          </ion-button>
        </ion-list-header>

        <input
          type="file"
          accept=".txt,text/plain"
          ref="txtFileInputRef"
          @change="handleTxtFileChange"
          style="display: none;"
          data-testid="txt-file-input" />

        <ion-item data-testid="no-products-message" v-if="products.length === 0 && !isLoadingData"> <ion-label class="ion-text-center ion-text-wrap">
            <p>Товары еще не добавлены.</p>
          </ion-label>
        </ion-item>
        <ion-item data-testid="loading-indicator" v-if="isLoadingData"> <ion-spinner name="dots" slot="start"></ion-spinner>
            <ion-label>Загрузка данных...</ion-label>
        </ion-item>

        <ion-item v-for="(product) in products" :key="product.id" :data-testid="`product-item-${product.id}`">
          <ion-label>
            <h2>{{ product.name }}</h2>
            <p>Секции: {{ product.sectionNames.length > 0 ? product.sectionNames.join(', ') : 'Не заданы' }}</p>
          </ion-label>
          <ion-button
            fill="clear"
            slot="end"
            @click="promptForProductSections(product)"
            title="Назначить секции"
            :data-testid="`assign-sections-button-${product.id}`"
          >
            <ion-icon slot="icon-only" :icon="optionsOutline"></ion-icon>
          </ion-button>
          <ion-button
            fill="clear"
            color="danger"
            slot="end"
            @click="confirmDeleteProduct(product)"
            title="Удалить товар"
            :data-testid="`delete-product-button-${product.id}`"
            >
            <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
          </ion-button>
        </ion-item>
      </ion-list>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonIcon,
  IonList, IonListHeader, IonItem, IonLabel, IonSpinner,
} from '@ionic/vue';
import {
  cloudUploadOutline, saveOutline, addCircleOutline, optionsOutline, trashOutline,
  documentTextOutline
} from 'ionicons/icons';
import {
  AppPreferences,
  AppFilesystem,
  AppToast,
  AppAlertController,
  Directory,
  Encoding
} from '@/utils/capacitor-wrappers';

const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts';
const SAVED_MAP_FILENAME = 'storeMapImage.txt';

interface Section { id: string; name: string; coords: { x: number; y: number; w: number; h: number }; }
interface Product { id: string; name: string; sectionNames: string[]; }

const imageFileInputRef = ref<HTMLInputElement | null>(null);
const txtFileInputRef = ref<HTMLInputElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const mapImageSrc = ref<string | null>(null);
const mapImageElement = ref<HTMLImageElement | null>(null);
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const sections = ref<Section[]>([]);
const products = ref<Product[]>([]);
const isLoadingData = ref(true);

const isDrawing = ref(false);
const startX = ref(0);
const startY = ref(0);
const currentRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);

onMounted(async () => {
  if (canvasRef.value) {
    ctxRef.value = canvasRef.value.getContext('2d');
    console.log('[DEBUG OperatorPage APP onMounted] canvasRef exists, ctxRef set:', !!ctxRef.value);
  } else {
    console.warn('[DEBUG OperatorPage APP onMounted] canvasRef is NULL onMounted!');
  }

  if (window.Cypress) {
    (window as any).testState = {
      getMapImageSrc: () => mapImageSrc.value,
      getIsDrawing: () => isDrawing.value,
      getCurrentRect: () => currentRect.value,
    };
    console.log('[DEBUG OperatorPage APP onMounted] testState exposed to window for Cypress. Initial mapImageSrc:', mapImageSrc.value);
  }

  await loadData();
});

const triggerImageFileUpload = () => { imageFileInputRef.value?.click(); };

const handleImageFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file && canvasRef.value && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imgSrc = e.target?.result as string;
      console.log('[DEBUG OperatorPage APP handleImageFileChange reader.onload] mapImageSrc WILL BE SET to:', imgSrc ? imgSrc.substring(0,60) + '...' : 'null/undefined');
      mapImageSrc.value = imgSrc;
      await nextTick();
      console.log('[DEBUG OperatorPage APP handleImageFileChange reader.onload] mapImageSrc.value AFTER nextTick:', mapImageSrc.value ? mapImageSrc.value.substring(0,60) + '...' : String(mapImageSrc.value));

      const img = new Image();
      img.onload = async () => {
        if (canvasRef.value && ctxRef.value) {
          mapImageElement.value = img;
          canvasRef.value.width = img.naturalWidth;
          canvasRef.value.height = img.naturalHeight;
          sections.value = [];
          console.log('[DEBUG OperatorPage APP img.onload] Новая карта загружена, секции очищены. Natural WxH:', img.naturalWidth, img.naturalHeight);
          await nextTick();
          redrawCanvas();
        } else {
          console.error('[DEBUG OperatorPage APP img.onload] canvasRef or ctxRef is null. canvasRef:', !!canvasRef.value, 'ctxRef:', !!ctxRef.value);
        }
      };
      img.onerror = async (err) => {
          console.error("[DEBUG OperatorPage APP img.onerror] Ошибка загрузки Image:", err);
          mapImageSrc.value = null; mapImageElement.value = null;
          await AppToast.show({ text: 'Не удалось загрузить изображение.', duration: 'short'});
          redrawCanvas();
      }
      img.src = imgSrc;
    };
    reader.onerror = async (err) => {
        console.error("[DEBUG OperatorPage APP reader.onerror] Ошибка FileReader:", err);
        mapImageSrc.value = null; mapImageElement.value = null;
        await AppToast.show({ text: 'Ошибка чтения файла изображения.', duration: 'short'});
        redrawCanvas();
    }
    reader.readAsDataURL(file);
  } else if (file && !file.type.startsWith('image/')) {
      AppToast.show({ text: 'Пожалуйста, выберите файл изображения.', duration: 'short'});
  }
  if (target) target.value = '';
};

const triggerTxtFileUpload = () => { txtFileInputRef.value?.click(); };

const handleTxtFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) { return; }
    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
        AppToast.show({ text: 'Пожалуйста, выберите файл .txt', duration: 'short'});
        if (target) target.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const fileContent = e.target?.result as string;
        if (typeof fileContent !== 'string') {
            await AppToast.show({ text: 'Не удалось прочитать содержимое файла.', duration: 'short'}); return;
        }
        try {
            const result = processProductList(fileContent);
            await AppToast.show({ text: `Импорт завершен. Добавлено: ${result.added}, Обновлено: ${result.updated}. ${result.warnings.length > 0 ? 'Предупреждений: ' + result.warnings.length : ''}`, duration: 'long' });
            if (result.warnings.length > 0) { console.warn("Предупреждения при импорте:", result.warnings); }
        } catch (error) {
            console.error("Ошибка обработки файла списка товаров:", error);
            await AppToast.show({ text: 'Ошибка при обработке файла.', duration: 'short'});
        } finally { if (target) target.value = ''; }
    };
    reader.onerror = async (err) => {
        console.error("Ошибка FileReader (TXT):", err);
        await AppToast.show({ text: 'Ошибка чтения текстового файла.', duration: 'short'});
        if (target) target.value = '';
    };
    reader.readAsText(file);
};

const processProductList = (content: string): { added: number, updated: number, warnings: string[] } => {
    let addedCount = 0;
    let updatedCount = 0;
    const warnings: string[] = [];
    const lines = content.split(/\r?\n/);
    const existingSectionNames = new Set(sections.value.map(s => s.name));
    console.log(`[DEBUG processProductList] Starting. Initial products.value count: ${products.value.length}`);
    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.includes(';')) {
            return;
        }
        const parts = trimmedLine.split(';');
        const productName = parts[0].trim();
        if (!productName) {
            warnings.push(`Строка ${lineNumber}: Пропущено - пустое имя товара.`);
            return;
        }
        const sectionNamesRaw = (parts[1] || '').trim();
        let parsedSectionNames: string[] = [];
        if (sectionNamesRaw) {
            parsedSectionNames = sectionNamesRaw
                .split(',')
                .map(name => name.trim())
                .filter(name => name.length > 0);
        }
        const validSectionNames = parsedSectionNames.filter(name => {
            if (existingSectionNames.has(name)) {
                return true;
            } else {
                warnings.push(`Строка ${lineNumber}: Секция "${name}" для товара "${productName}" не найдена и будет проигнорирована.`);
                return false;
            }
        });
        const existingProductIndex = products.value.findIndex(p => p.name.toLowerCase() === productName.toLowerCase());
        if (existingProductIndex > -1) {
            console.log(`[DEBUG processProductList] Updating existing product: "${productName}" at index ${existingProductIndex}`);
            products.value[existingProductIndex].sectionNames = validSectionNames;
            updatedCount++;
        } else {
            console.log(`[DEBUG processProductList] Adding NEW product: "${productName}"`);
            const newProduct: Product = {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7) + productName.replace(/\s/g, ''),
                name: productName,
                sectionNames: validSectionNames
            };
            products.value.push(newProduct);
            addedCount++;
        }
    });
    console.log(`[DEBUG processProductList] FINAL counts: added=${addedCount}, updated=${updatedCount}, warnings=${warnings.length}`);
    console.log(`[DEBUG processProductList] Final products.value count: ${products.value.length}`);
    return { added: addedCount, updated: updatedCount, warnings };
};

const getCoords = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
  const canvas = canvasRef.value;
  if (!canvas) {
    console.warn('[DEBUG OperatorPage APP getCoords] canvasRef is null!');
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  let clientX: number | undefined;
  let clientY: number | undefined;

  if ((event as TouchEvent).touches && (event as TouchEvent).touches.length > 0) {
    clientX = (event as TouchEvent).touches[0].clientX;
    clientY = (event as TouchEvent).touches[0].clientY;
    console.log('[DEBUG OperatorPage APP getCoords] Event identified as TouchEvent (active touches).');
  } else if (typeof (event as MouseEvent).clientX === 'number' && typeof (event as MouseEvent).clientY === 'number') {
    clientX = (event as MouseEvent).clientX;
    clientY = (event as MouseEvent).clientY;
    console.log('[DEBUG OperatorPage APP getCoords] Event identified as MouseEvent or compatible (has clientX/Y).');
  } else {
    console.error('[DEBUG OperatorPage APP getCoords] Unknown event type or event missing clientX/Y and touches. Event:', event);
    return { x: 0, y: 0 };
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  return { x: Math.round(canvasX), y: Math.round(canvasY) };
};

const handleMouseDown = (event: MouseEvent) => {
  console.log('[DEBUG OperatorPage APP] handleMouseDown: Attempting to start draw. mapImageSrc value:', mapImageSrc.value ? mapImageSrc.value.substring(0, 60) + '...' : String(mapImageSrc.value));
  console.log('[DEBUG OperatorPage APP] handleMouseDown: ctxRef.value exists:', !!ctxRef.value);

  if (!ctxRef.value || !mapImageSrc.value) {
    console.error('[DEBUG OperatorPage APP] handleMouseDown: FATAL EARLY EXIT - ctxRef or mapImageSrc is missing/falsy.');
    return;
  }
  console.log('[DEBUG OperatorPage APP] handleMouseDown: Entered successfully, proceeding to draw.');
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: x, y: y, w: 0, h: 0 };
  console.log('[DEBUG OperatorPage APP] handleMouseDown: startX/Y:', x, y, 'isDrawing:', isDrawing.value);
};

const handleMouseMove = (event: MouseEvent) => {
  if (!isDrawing.value || !ctxRef.value || !currentRect.value) return;
  const { x, y } = getCoords(event);
  currentRect.value = { x: startX.value, y: startY.value, w: x - startX.value, h: y - startY.value };
  redrawCanvas();
};

const handleMouseLeave = () => {
  if (isDrawing.value) {
    console.log('[DEBUG OperatorPage APP] handleMouseLeave: Drawing was active, stopping and clearing currentRect.');
    isDrawing.value = false;
    currentRect.value = null;
    redrawCanvas();
  }
};

const handleMouseUp = () => {
  if (!currentRect.value || !ctxRef.value) {
    console.log('[DEBUG OperatorPage APP] handleMouseUp: Early exit - no currentRect or no ctxRef. isDrawing:', isDrawing.value);
    if (isDrawing.value) isDrawing.value = false;
    if (currentRect.value) currentRect.value = null;
    redrawCanvas();
    return;
  }
  console.log('[DEBUG OperatorPage APP] handleMouseUp: Entered. isDrawing (expected true):', isDrawing.value, 'currentRect before processing:', currentRect.value ? JSON.parse(JSON.stringify(currentRect.value)) : 'null');

  const wasActuallyDrawing = isDrawing.value;
  isDrawing.value = false;

  const rectToProcess = { ...currentRect.value };
  currentRect.value = null;

  let finalX = rectToProcess.x;
  let finalY = rectToProcess.y;
  let finalWidth = rectToProcess.w;
  let finalHeight = rectToProcess.h;

  if (finalWidth < 0) { finalX = rectToProcess.x + rectToProcess.w; finalWidth = Math.abs(rectToProcess.w); }
  if (finalHeight < 0) { finalY = rectToProcess.y + rectToProcess.h; finalHeight = Math.abs(rectToProcess.h); }

  console.log('[DEBUG OperatorPage APP] handleMouseUp: wasActuallyDrawing:', wasActuallyDrawing, 'finalWidth:', finalWidth, 'finalHeight:', finalHeight);

  if (wasActuallyDrawing && (finalWidth > 5 || finalHeight > 5)) {
    console.log('[DEBUG OperatorPage APP] handleMouseUp: Condition MET (finalW:', finalWidth, ', finalH:', finalHeight, '), calling promptForSectionName with coords:', { x: finalX, y: finalY, w: finalWidth, h: finalHeight });
    promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
  } else {
    console.log('[DEBUG OperatorPage APP] handleMouseUp: Condition NOT MET (wasActuallyDrawing:', wasActuallyDrawing, 'finalW:', finalWidth, ', finalH:', finalHeight, '), redrawing canvas.');
    redrawCanvas();
  }
};

const handleTouchStart = (event: TouchEvent) => {
  console.log('[DEBUG OperatorPage APP] handleTouchStart: Attempting to start draw. mapImageSrc value:', mapImageSrc.value ? mapImageSrc.value.substring(0, 60) + '...' : String(mapImageSrc.value));
  console.log('[DEBUG OperatorPage APP] handleTouchStart: ctxRef.value exists:', !!ctxRef.value);
  if (!ctxRef.value || !mapImageSrc.value) {
    console.error('[DEBUG OperatorPage APP] handleTouchStart: FATAL EARLY EXIT - ctxRef or mapImageSrc is missing/falsy.');
    return;
  }
  console.log('[DEBUG OperatorPage APP] handleTouchStart: Entered successfully, proceeding to draw.');
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: x, y: y, w: 0, h: 0 };
  console.log('[DEBUG OperatorPage APP] handleTouchStart: startX/Y:', x, y, 'isDrawing:', isDrawing.value);
};

const handleTouchMove = (event: TouchEvent) => {
  if (!isDrawing.value || !ctxRef.value || !currentRect.value) return;
  const { x, y } = getCoords(event);
  currentRect.value = { x: startX.value, y: startY.value, w: x - startX.value, h: y - startY.value };
  redrawCanvas();
};

const handleTouchEnd = () => {
  if (!currentRect.value || !ctxRef.value) {
      console.log('[DEBUG OperatorPage APP] handleTouchEnd: Early exit - no currentRect or no ctxRef. isDrawing:', isDrawing.value);
      if (isDrawing.value) isDrawing.value = false;
      if (currentRect.value) currentRect.value = null;
      redrawCanvas();
    return;
  }
  console.log('[DEBUG OperatorPage APP] handleTouchEnd: Entered. isDrawing (expected true):', isDrawing.value, 'currentRect before processing:', currentRect.value ? JSON.parse(JSON.stringify(currentRect.value)) : 'null');
  const wasActuallyDrawing = isDrawing.value;
  isDrawing.value = false;
  const rectToProcess = { ...currentRect.value };
  currentRect.value = null;
  let finalX = rectToProcess.x;
  let finalY = rectToProcess.y;
  let finalWidth = rectToProcess.w;
  let finalHeight = rectToProcess.h;
  if (finalWidth < 0) { finalX = rectToProcess.x + rectToProcess.w; finalWidth = Math.abs(rectToProcess.w); }
  if (finalHeight < 0) { finalY = rectToProcess.y + rectToProcess.h; finalHeight = Math.abs(rectToProcess.h); }

  console.log('[DEBUG OperatorPage APP] handleTouchEnd: wasActuallyDrawing:', wasActuallyDrawing, 'finalWidth:', finalWidth, 'finalHeight:', finalHeight);

  if (wasActuallyDrawing && (finalWidth > 5 || finalHeight > 5)) {
    console.log('[DEBUG OperatorPage APP] handleTouchEnd: Condition MET, calling promptForSectionName with coords:', { x: finalX, y: finalY, w: finalWidth, h: finalHeight });
    promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
  } else {
    console.log('[DEBUG OperatorPage APP] handleTouchEnd: Condition NOT MET (wasActuallyDrawing:', wasActuallyDrawing, ', finalW:', finalWidth, ', finalH:', finalHeight, '), redrawing canvas.');
    redrawCanvas();
  }
};

const redrawCanvas = () => {
    if (!ctxRef.value || !canvasRef.value) { console.warn("redrawCanvas: Контекст или canvas не найден"); return; }
    const ctx = ctxRef.value; const canvas = canvasRef.value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mapImageElement.value && mapImageElement.value.complete && mapImageElement.value.naturalWidth > 0) {
        try { ctx.drawImage(mapImageElement.value, 0, 0, canvas.width, canvas.height); } catch (e) { console.error("Ошибка отрисовки карты:", e); }
    } else {
        ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '14px sans-serif';
        ctx.fillText(mapImageSrc.value ? 'Загрузка карты...' : 'Загрузите карту магазина', canvas.width/2, canvas.height/2);
    }
    ctx.lineWidth = 2;
    sections.value.forEach(section => {
        const { x, y, w, h } = section.coords;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(section.name, centerX, centerY);
    });
    if (isDrawing.value && currentRect.value) {
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
        if (currentRect.value.w !== 0 || currentRect.value.h !== 0) {
            ctx.strokeRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
            ctx.fillRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
        }
    }
    ctx.lineWidth = 1;
};

const promptForSectionName = async (coords: { x: number; y: number; w: number; h: number }) => {
  console.log('[DEBUG OperatorPage APP] promptForSectionName CALLED with coords:', coords ? JSON.parse(JSON.stringify(coords)) : 'null/undefined');
  const alert = await AppAlertController.create({
    header: 'Название секции',
    inputs: [{ name: 'sectionName', type: 'text', placeholder: 'Например: Овощи', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done'} }],
    buttons: [
      { text: 'Отмена', role: 'cancel', handler: () => { console.log('[DEBUG OperatorPage APP] Alert SectionName Cancelled by user'); redrawCanvas(); } },
      { text: 'ОК', handler: (data) => {
          console.log('[DEBUG OperatorPage APP] Alert SectionName OK handler CALLED with data:', data);
          const name = data.sectionName?.trim();
          if (name && coords.w > 0 && coords.h > 0) {
            if (sections.value.some(s => s.name.toLowerCase() === name.toLowerCase())) {
              AppToast.show({ text: `Секция с именем "${name}" уже существует!`, duration: 'short'});
            } else {
                const newSection: Section = {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                name: name,
                coords: coords
                };
                sections.value.push(newSection);
            }
          } else {
            if (!name) AppToast.show({ text: 'Название секции не может быть пустым.', duration: 'short'});
          }
          redrawCanvas();
        }
      }
    ],
    backdropDismiss: false
  });
  console.log('[DEBUG OperatorPage APP] AppAlertController.create for SectionName resolved, calling alert.present()');
  await alert.present();
  console.log('[DEBUG OperatorPage APP] alert.present() for SectionName awaited');
};

const promptForNewProduct = async () => {
  console.log('[DEBUG OperatorPage APP] promptForNewProduct CALLED');
  const alert = await AppAlertController.create({
    header: 'Новый товар',
    inputs: [{ name: 'productName', type: 'text', placeholder: 'Название товара', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done' } }],
    buttons: [
      { text: 'Отмена', role: 'cancel', handler: () => { console.log('[DEBUG OperatorPage APP] Alert NewProduct Cancelled'); } },
      { text: 'Добавить', handler: (data) => {
          console.log('[DEBUG OperatorPage APP] Alert NewProduct Add handler CALLED with data:', data);
          const name = data.productName?.trim();
          if (name) {
            if (products.value.some(p => p.name.toLowerCase() === name.toLowerCase())) {
              AppToast.show({ text: `Товар с именем "${name}" уже существует!`, duration: 'short'});
              return;
            }
            const newProduct: Product = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
              name: name,
              sectionNames: []
            };
            products.value.push(newProduct);
            AppToast.show({ text: `Товар "${name}" добавлен. Не забудьте назначить секции и сохранить изменения.`, duration: 'long'});
          } else {
            AppToast.show({ text: 'Название не может быть пустым.', duration: 'short'});
          }
        }}
    ],
    backdropDismiss: false
  });
  console.log('[DEBUG OperatorPage APP] AppAlertController.create for NewProduct resolved, calling alert.present()');
  await alert.present();
  console.log('[DEBUG OperatorPage APP] alert.present() for NewProduct awaited');
};

const promptForProductSections = async (product: Product) => {
  console.log('[DEBUG OperatorPage APP] promptForProductSections CALLED for product:', product.name);
  if (sections.value.length === 0) {
    await AppToast.show({ text: 'Сначала определите секции на карте!', duration: 'short'});
    return;
  }
  const sectionInputs = sections.value.map(section => ({
    name: section.name, type: 'checkbox' as const, label: section.name, value: section.name, checked: product.sectionNames.includes(section.name)
  }));
  const alert = await AppAlertController.create({
    header: `Секции для "${product.name}"`,
    inputs: sectionInputs,
    buttons: [
      { text: 'Отмена', role: 'cancel', handler: () => { console.log('[DEBUG OperatorPage APP] Alert ProductSections Cancelled'); } },
      { text: 'Сохранить', handler: (selectedSectionNames: string[]) => {
          console.log('[DEBUG OperatorPage APP] Alert ProductSections Save handler CALLED with data:', selectedSectionNames);
          const productIndex = products.value.findIndex(p => p.id === product.id);
          if (productIndex > -1) {
            products.value[productIndex].sectionNames = selectedSectionNames || [];
            console.log(`Секции для "${product.name}" обновлены:`, selectedSectionNames);
            AppToast.show({text:'Назначение секций обновлено. Не забудьте сохранить все изменения.', duration:'long'})
          }
        }}
    ],
    backdropDismiss: false
  });
  console.log('[DEBUG OperatorPage APP] AppAlertController.create for ProductSections resolved, calling alert.present()');
  await alert.present();
  console.log('[DEBUG OperatorPage APP] alert.present() for ProductSections awaited');
};

const confirmDeleteProduct = async (productToDelete: Product) => {
  console.log('[DEBUG OperatorPage APP] confirmDeleteProduct CALLED for product:', productToDelete.name);
  const alert = await AppAlertController.create({
    header: 'Подтверждение удаления',
    message: `Вы уверены, что хотите удалить товар "${productToDelete.name}"? Это действие нельзя будет отменить.`,
    buttons: [
      { text: 'Отмена', role: 'cancel', cssClass: 'secondary', handler: () => { console.log('[DEBUG OperatorPage APP] Alert DeleteProduct Cancelled'); } },
      { text: 'Удалить', cssClass: 'danger', handler: () => {
          console.log('[DEBUG OperatorPage APP] Alert DeleteProduct Delete handler CALLED');
          const index = products.value.findIndex(p => p.id === productToDelete.id);
          if (index > -1) {
            products.value.splice(index, 1);
            console.log(`Товар "${productToDelete.name}" удален локально.`);
            AppToast.show({ text: `Товар "${productToDelete.name}" удален. Нажмите 'Сохранить Все Изменения' для подтверждения.`, duration: 'long' });
          }
        },
      },
    ],
    backdropDismiss: false
  });
  console.log('[DEBUG OperatorPage APP] AppAlertController.create for DeleteProduct resolved, calling alert.present()');
  await alert.present();
  console.log('[DEBUG OperatorPage APP] alert.present() for DeleteProduct awaited');
};

const loadData = async () => {
  console.log('OperatorPage: Загрузка данных...');
  isLoadingData.value = true;
  let mapUri: string | null = null;
  try {
    const [sectionsResult, productsResult, uriResult] = await Promise.all([
      AppPreferences.get({ key: MAP_SECTIONS_KEY }),
      AppPreferences.get({ key: PRODUCTS_KEY }),
      AppPreferences.get({ key: MAP_IMAGE_URI_KEY })
    ]);
    sections.value = sectionsResult.value ? JSON.parse(sectionsResult.value) : [];
    products.value = productsResult.value ? JSON.parse(productsResult.value) : [];
    mapUri = uriResult.value;
    console.log(`Загружено секций: ${sections.value.length}, товаров: ${products.value.length}, URI карты: ${mapUri ? 'Есть' : 'Нет'}`);

    mapImageElement.value = null;
    mapImageSrc.value = null;
    console.log('[DEBUG OperatorPage APP loadData] mapUri:', mapUri);

    if (mapUri) {
      try {
        console.log(`[DEBUG OperatorPage APP loadData] Attempting to read file for map: ${mapUri}`);
        const readFileResult = await AppFilesystem.readFile({ path: mapUri, encoding: Encoding.UTF8 });
        const loadedDataUrl = readFileResult.data as string;
        console.log(`[DEBUG OperatorPage APP loadData] Map file read SUCCESS. Data URL starts with: ${loadedDataUrl ? loadedDataUrl.substring(0, 60) : 'N/A'}`);

        if (loadedDataUrl && loadedDataUrl.startsWith('data:image')) {
          mapImageSrc.value = loadedDataUrl;
          await nextTick();
          const img = new Image();
          console.log("Начинаем загрузку изображения карты (из loadData)...");
          try {
            await new Promise<void>((resolve, reject) => {
              img.onload = async () => {
                console.log("Карта (из loadData): img.onload сработал.");
                if (canvasRef.value) {
                  mapImageElement.value = img;
                  canvasRef.value.width = img.naturalWidth;
                  canvasRef.value.height = img.naturalHeight;
                  await nextTick();
                  redrawCanvas();
                  resolve();
                } else {
                  console.error("Карта (из loadData): Canvas ref не найден в img.onload.");
                  reject(new Error("Canvas ref не найден в img.onload при загрузке данных"));
                }
              };
              img.onerror = (err) => {
                console.error("Карта (из loadData): img.onerror сработал:", err);
                mapImageSrc.value = null; mapImageElement.value = null;
                reject(err instanceof Error ? err : new Error('Ошибка загрузки изображения карты'));
              };
              console.log("Карта (из loadData): Устанавливаем img.src.");
              img.src = loadedDataUrl;
            });
            console.log("Загрузка изображения карты (Promise из loadData) завершена успешно.");
          } catch (promiseError) {
            console.error("Ошибка во время ожидания Promise загрузки изображения (из loadData):", promiseError);
            mapImageSrc.value = null; mapImageElement.value = null;
            await nextTick(); redrawCanvas();
            await AppToast.show({ text: 'Не удалось загрузить изображение карты.', duration: 'short' });
          }
        } else {
          console.error("[DEBUG OperatorPage APP loadData] Loaded data is not a valid image Data URL.", loadedDataUrl ? loadedDataUrl.substring(0,60) : 'N/A');
          mapImageSrc.value = null;
          await nextTick(); redrawCanvas();
        }
      } catch (readError) {
        console.error(`[DEBUG OperatorPage APP loadData] Error reading map file (${mapUri}):`, readError);
        await AppPreferences.remove({ key: MAP_IMAGE_URI_KEY });
        mapImageSrc.value = null; mapImageElement.value = null;
        await AppToast.show({ text: 'Ошибка загрузки сохраненной карты.', duration: 'short' });
        await nextTick(); redrawCanvas();
      }
    } else {
      console.log('[DEBUG OperatorPage APP loadData] No mapUri found.');
      await nextTick(); redrawCanvas();
    }
  } catch (error) {
    console.error("OperatorPage: Критическая ошибка загрузки данных:", error);
    sections.value = []; products.value = [];
    mapImageSrc.value = null; mapImageElement.value = null;
    await AppToast.show({ text: 'Критическая ошибка загрузки данных!', duration: 'long'});
    await nextTick(); redrawCanvas();
  } finally {
    isLoadingData.value = false;
    console.log('[DEBUG OperatorPage APP loadData] isLoadingData set to false. mapImageSrc is:', mapImageSrc.value ? mapImageSrc.value.substring(0,60)+'...' : String(mapImageSrc.value));
  }
};

const saveData = async () => {
    if (!mapImageSrc.value && sections.value.length === 0 && products.value.length === 0) {
        await AppToast.show({ text: 'Нет данных для сохранения.', duration: 'short'}); return;
    }
    console.log('OperatorPage: Сохранение ВСЕХ данных...');
    try {
        if (mapImageSrc.value) {
            try {
                const writeResult = await AppFilesystem.writeFile({
                    path: SAVED_MAP_FILENAME, data: mapImageSrc.value, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true
                });
                await AppPreferences.set({ key: MAP_IMAGE_URI_KEY, value: writeResult.uri });
                console.log('Карта сохранена в:', writeResult.uri);
            } catch (mapSaveError) {
                console.error("Ошибка сохранения файла карты:", mapSaveError);
                await AppToast.show({ text: 'Ошибка сохранения файла карты!', duration: 'long'});
            }
        } else {
            await AppPreferences.remove({ key: MAP_IMAGE_URI_KEY });
            console.log('URI карты удален из Preferences, т.к. карты нет.');
        }
        await AppPreferences.set({ key: MAP_SECTIONS_KEY, value: JSON.stringify(sections.value) });
        await AppPreferences.set({ key: PRODUCTS_KEY, value: JSON.stringify(products.value) });
        console.log('OperatorPage: Секции и товары сохранены.');
        await AppToast.show({ text: 'Все данные успешно сохранены!', duration: 'short' });
    } catch (error) {
        console.error("OperatorPage: Ошибка сохранения данных в Preferences:", error);
        await AppToast.show({ text: 'Ошибка сохранения данных!', duration: 'long' });
    }
};
</script>

<style scoped>
.map-editor-container {
  margin-top: 10px;
  touch-action: none;
  overflow: auto;
  max-height: 55vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f0f0f0;
  border: 1px dashed var(--ion-color-medium);
}
canvas {
  cursor: crosshair;
  display: block;
}
ion-list-header {
  align-items: center;
  --min-height: 40px;
}
ion-list-header ion-label {
  margin: 0;
}
ion-list-header ion-button {
  margin: 0 0 0 5px;
  --padding-start: 5px;
  --padding-end: 5px;
  height: 30px;
}
ion-item p {
  font-size: 0.8em;
  color: var(--ion-color-medium-shade);
  white-space: normal;
}
ul {
  list-style-type: none;
  padding-left: 0;
  margin-top: 5px;
}
li {
  padding: 2px 0;
  font-size: 0.9em;
}
hr {
  border: none;
  border-top: 1px solid var(--ion-color-step-200, #cccccc);
}
</style>