<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Панель Оператора</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true" class="ion-padding">
      <ion-button expand="block" @click="triggerFileUpload">
        <ion-icon slot="start" :icon="cloudUploadOutline"></ion-icon>
        Загрузить Схему Магазина
      </ion-button>

      <input
        type="file"
        accept="image/*"
        ref="fileInputRef"
        @change="handleFileChange"
        style="display: none;"
      />

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
        ></canvas>
      </div>

      <div>
        <h3>Определенные секции:</h3>
        <ul v-if="sections.length > 0">
          <li v-for="(section) in sections" :key="section.name"> {{ section.name }} ({{ section.coords.x }}, {{ section.coords.y }}, {{ section.coords.w }}x{{ section.coords.h }})
            </li>
        </ul>
        <p v-else>Секции еще не добавлены.</p>
      </div>

      <ion-button expand="block" color="success" class="ion-margin-top" :disabled="!mapImageSrc" @click="saveData">
        <ion-icon slot="start" :icon="saveOutline"></ion-icon>
        Сохранить все изменения
      </ion-button>

      <hr style="margin: 20px 0;">

      <ion-list lines="inset" class="ion-margin-top">
        <ion-list-header>
          <ion-label>Управление Товарами</ion-label>
          <ion-button @click="promptForNewProduct" fill="clear" size="small" title="Добавить товар">
            <ion-icon slot="icon-only" :icon="addCircleOutline"></ion-icon>
          </ion-button>
        </ion-list-header>

        <ion-item v-if="products.length === 0">
          <ion-label class="ion-text-center ion-text-wrap">
            <p>Товары еще не добавлены.</p>
          </ion-label>
        </ion-item>

        <ion-item v-for="(product) in products" :key="product.id">
          <ion-label>
            <h2>{{ product.name }}</h2>
            <p>Секции: {{ product.sectionNames.length > 0 ? product.sectionNames.join(', ') : 'Не заданы' }}</p>
          </ion-label>
          <ion-button fill="clear" slot="end" @click="promptForProductSections(product)" title="Назначить секции">
            <ion-icon slot="icon-only" :icon="optionsOutline"></ion-icon>
          </ion-button>
           </ion-item>
      </ion-list>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  alertController,
} from '@ionic/vue';
import { cloudUploadOutline, saveOutline, addCircleOutline, optionsOutline } from 'ionicons/icons';

// Импорты Capacitor API
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';

// --- Константы для ключей хранения ---
const MAP_IMAGE_URI_KEY = 'storeMapFileUri';
const MAP_SECTIONS_KEY = 'storeMapSections';
const PRODUCTS_KEY = 'storeProducts';
const SAVED_MAP_FILENAME = 'storeMapImage.txt'; // Имя файла для сохранения Data URL карты

// --- Интерфейсы ---
interface Section {
  // Добавим ID для надежности, будем генерировать при создании
  id: string;
  name: string;
  coords: { x: number; y: number; w: number; h: number };
}

interface Product {
  id: string; // Уникальный ID
  name: string;
  sectionNames: string[]; // Массив имен секций (пока используем имена)
}

// --- Refs ---
const fileInputRef = ref<HTMLInputElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const mapImageSrc = ref<string | null>(null); // Data URL исходного изображения
const mapImageElement = ref<HTMLImageElement | null>(null); // Готовый <image> объект
const ctxRef = ref<CanvasRenderingContext2D | null>(null); // Контекст для рисования
const sections = ref<Section[]>([]); // Используем интерфейс Section
const products = ref<Product[]>([]); // Ref для массива товаров

// --- Drawing State ---
const isDrawing = ref(false);
const startX = ref(0);
const startY = ref(0);
const currentRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);

// --- Lifecycle Hooks ---
onMounted(async () => {
  if (canvasRef.value) {
    ctxRef.value = canvasRef.value.getContext('2d');
  }
  await loadData(); // Вызываем загрузку данных при старте
});

// --- Functions ---

const triggerFileUpload = () => {
  fileInputRef.value?.click();
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file && canvasRef.value) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgSrc = e.target?.result as string;
      mapImageSrc.value = imgSrc; // Сохраняем Data URL

      const img = new Image();
      img.onload = () => {
        if (canvasRef.value && ctxRef.value) {
          // Устанавливаем размер canvas равным размеру изображения
          canvasRef.value.width = img.width;
          canvasRef.value.height = img.height;
          // Рисуем изображение на canvas
          ctxRef.value.drawImage(img, 0, 0);
          // Сбрасываем предыдущие секции при загрузке новой карты
          sections.value = [];
          // Сохраняем объект Image для быстрой перерисовки
          mapImageElement.value = img;
        }
      };
      img.onerror = (err) => console.error("Ошибка загрузки изображения в Image():", err);
      img.src = imgSrc; // Устанавливаем источник для объекта Image
    };
    reader.onerror = (err) => console.error("Ошибка чтения файла:", err);
    reader.readAsDataURL(file);
  }
  // Сбрасываем инпут, чтобы можно было выбрать тот же файл
  if (target) target.value = '';
};

// --- Drawing Event Handlers ---

const getCoords = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  let clientX, clientY;
  if (event instanceof MouseEvent) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  }
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  return { x: Math.round(canvasX), y: Math.round(canvasY) };
};


const handleMouseDown = (event: MouseEvent) => {
  if (!ctxRef.value || !mapImageSrc.value) return;
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: startX.value, y: startY.value, w: 0, h: 0 };
};

const handleMouseMove = (event: MouseEvent) => {
  if (!isDrawing.value || !ctxRef.value) return;
  const { x, y } = getCoords(event);
  const width = x - startX.value;
  const height = y - startY.value;
  currentRect.value = { x: startX.value, y: startY.value, w: width, h: height };
  redrawCanvas();
};

const handleMouseUp = (event: MouseEvent) => {
  if (!isDrawing.value || !ctxRef.value) return;
  const wasDrawing = isDrawing.value;
  isDrawing.value = false;
  currentRect.value = null;

  const { x, y } = getCoords(event);
  let finalWidth = x - startX.value;
  let finalHeight = y - startY.value;
  let finalX = startX.value;
  let finalY = startY.value;

  if (finalWidth < 0) {
      finalX = x;
      finalWidth = Math.abs(finalWidth);
  }
  if (finalHeight < 0) {
      finalY = y;
      finalHeight = Math.abs(finalHeight);
  }

  if (wasDrawing && (finalWidth > 5 || finalHeight > 5)) { // Добавим минимальный размер
     promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
  } else {
     redrawCanvas();
  }
};

const handleMouseLeave = (event: MouseEvent) => {
  if (isDrawing.value) {
    isDrawing.value = false;
    currentRect.value = null;
    redrawCanvas();
  }
};

const handleTouchStart = (event: TouchEvent) => {
  if (!ctxRef.value || !mapImageSrc.value) return;
  isDrawing.value = true;
  const { x, y } = getCoords(event);
  startX.value = x;
  startY.value = y;
  currentRect.value = { x: startX.value, y: startY.value, w: 0, h: 0 };
};

const handleTouchMove = (event: TouchEvent) => {
  if (!isDrawing.value || !ctxRef.value) return;
   const { x, y } = getCoords(event);
   const width = x - startX.value;
   const height = y - startY.value;
   currentRect.value = { x: startX.value, y: startY.value, w: width, h: height };
   redrawCanvas();
};

const handleTouchEnd = (event: TouchEvent) => {
   if (!ctxRef.value) return;
   const wasDrawing = isDrawing.value;
   isDrawing.value = false;

   let finalX = currentRect.value?.x ?? startX.value;
   let finalY = currentRect.value?.y ?? startY.value;
   let finalWidth = currentRect.value?.w ?? 0;
   let finalHeight = currentRect.value?.h ?? 0;

   currentRect.value = null;

   if (finalWidth < 0) {
      finalX = finalX + finalWidth;
      finalWidth = Math.abs(finalWidth);
   }
   if (finalHeight < 0) {
      finalY = finalY + finalHeight;
      finalHeight = Math.abs(finalHeight);
   }

   if (wasDrawing && (finalWidth > 5 || finalHeight > 5)) { // Добавим минимальный размер
     promptForSectionName({ x: finalX, y: finalY, w: finalWidth, h: finalHeight });
   } else {
     redrawCanvas();
   }
};

// --- Redraw Function ---
 const redrawCanvas = () => {
   if (!ctxRef.value || !canvasRef.value) return;
   const ctx = ctxRef.value;
   const canvas = canvasRef.value;

   ctx.clearRect(0, 0, canvas.width, canvas.height);

   if (mapImageElement.value) {
     try {
         ctx.drawImage(mapImageElement.value, 0, 0, canvas.width, canvas.height);
     } catch (error) {
         console.error("Ошибка отрисовки фонового изображения:", error);
     }

     // Рисуем сохраненные секции
     ctx.lineWidth = 2;
     sections.value.forEach(section => {
       ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
       ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
       ctx.strokeRect(section.coords.x, section.coords.y, section.coords.w, section.coords.h);
       ctx.fillRect(section.coords.x, section.coords.y, section.coords.w, section.coords.h);
     });

     // Рисуем текущий рисуемый прямоугольник
     if (isDrawing.value && currentRect.value) {
       ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
       ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
       if (currentRect.value.w !== 0 || currentRect.value.h !== 0) {
            ctx.strokeRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
            ctx.fillRect(currentRect.value.x, currentRect.value.y, currentRect.value.w, currentRect.value.h);
       }
     }
   }
 };

 // --- Section Naming ---
 const promptForSectionName = async (coords: { x: number; y: number; w: number; h: number }) => {
   const alert = await alertController.create({
     header: 'Название секции',
     inputs: [ { name: 'sectionName', type: 'text', placeholder: 'Например: Овощи', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done'} } ],
     buttons: [
       { text: 'Отмена', role: 'cancel', handler: () => redrawCanvas() }, // Перерисовать, чтобы убрать синий прямоугольник
       {
         text: 'ОК',
         handler: (data) => {
           const name = data.sectionName?.trim();
           if (name && coords.w > 0 && coords.h > 0) {
             // Генерируем простой ID для секции
             const newSection: Section = { id: Date.now().toString(), name: name, coords: coords };
             sections.value.push(newSection);
             console.log('Секция добавлена:', newSection);
             redrawCanvas();
           } else {
              console.log('Некорректное имя или размеры секции, не добавляем.');
              redrawCanvas();
           }
         },
       },
     ],
     backdropDismiss: false
   });
   await alert.present();
 };

// --- Product Management Functions ---

const promptForNewProduct = async () => {
  const alert = await alertController.create({
    header: 'Новый товар',
    inputs: [ { name: 'productName', type: 'text', placeholder: 'Название товара', attributes: { autocapitalize: 'sentences', enterkeyhint: 'done' } } ],
    buttons: [
      { text: 'Отмена', role: 'cancel' },
      {
        text: 'Добавить',
        handler: (data) => {
          const name = data.productName?.trim();
          if (name) {
            const newProduct: Product = { id: Date.now().toString(), name: name, sectionNames: [] };
            products.value.push(newProduct);
            console.log('Товар добавлен:', newProduct);
          } else {
            Toast.show({ text: 'Название товара не может быть пустым.', duration: 'short'});
          }
        }
      }
    ],
    backdropDismiss: false
  });
  await alert.present();
};

const promptForProductSections = async (product: Product) => {
  if (sections.value.length === 0) {
      await Toast.show({ text: 'Сначала определите секции на карте!', duration: 'short'});
      return;
  }
  const sectionInputs = sections.value.map(section => ({
    name: section.name, // Имя секции будет значением чекбокса
    type: 'checkbox' as const,
    label: section.name,
    value: section.name,
    checked: product.sectionNames.includes(section.name)
  }));

  const alert = await alertController.create({
    header: `Секции для "${product.name}"`,
    inputs: sectionInputs,
    buttons: [
      { text: 'Отмена', role: 'cancel' },
      {
        text: 'Сохранить',
        handler: (selectedNames: string[]) => {
          const productIndex = products.value.findIndex(p => p.id === product.id);
          if (productIndex > -1) {
            // Обновляем напрямую в массиве, Vue 3 отследит изменение
            products.value[productIndex].sectionNames = selectedNames;
            console.log(`Секции для "${product.name}" обновлены:`, selectedNames);
            console.log('Массив products ПОСЛЕ обновления:', JSON.parse(JSON.stringify(products.value)));
          }
        }
      }
    ],
    backdropDismiss: false
  });
  await alert.present();
};


// --- Data Persistence Functions ---

const loadData = async () => {
  console.log('Загрузка данных...');
  let mapLoaded = false;
  try {
    // Загрузка секций
    const sectionsResult = await Preferences.get({ key: MAP_SECTIONS_KEY });
     if (sectionsResult.value) {
        try { sections.value = JSON.parse(sectionsResult.value); console.log('Секции загружены:', sections.value.length); }
        catch (e) { console.error('Ошибка парсинга секций:', e); sections.value = []; }
     } else { sections.value = []; }

     // Загрузка карты
     const uriResult = await Preferences.get({ key: MAP_IMAGE_URI_KEY });
     if (uriResult.value) {
        const savedUri = uriResult.value;
        const readFileResult = await Filesystem.readFile({ path: savedUri, encoding: Encoding.UTF8 });
        const loadedDataUrl = readFileResult.data as string;
        mapImageSrc.value = loadedDataUrl;
        const img = new Image();
        // Используем Promise для ожидания загрузки, чтобы redrawCanvas был вызван после
        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                if (canvasRef.value && ctxRef.value) {
                    mapImageElement.value = img;
                    canvasRef.value.width = img.width;
                    canvasRef.value.height = img.height;
                    mapLoaded = true;
                    console.log('Карта загружена, готова к отрисовке');
                    resolve(); // Разрешаем Promise после загрузки
                } else {
                    reject(new Error("Canvas или context не найдены при загрузке Image"));
                }
            };
            img.onerror = (err) => {
                console.error("Ошибка загрузки Image() из сохраненных данных:", err);
                reject(err); // Отклоняем Promise при ошибке
            }
            img.src = loadedDataUrl;
        });
     } else {
          mapImageSrc.value = null; mapImageElement.value = null; sections.value = [];
          if(canvasRef.value && ctxRef.value) { ctxRef.value.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height); }
     }

    // Загрузка товаров
    const productsResult = await Preferences.get({ key: PRODUCTS_KEY });
    if (productsResult.value) {
      try { products.value = JSON.parse(productsResult.value); 
      console.log('Товары загружены:', products.value.length); 
      console.log('Загруженные товары (детально):', JSON.parse(JSON.stringify(products.value)));}
      catch (e) { console.error('Ошибка парсинга товаров:', e); products.value = []; }
    } else { products.value = []; }

  } catch (error) {
    console.error("Ошибка при загрузке данных:", error);
    await Toast.show({ text: 'Ошибка загрузки данных!', duration: 'short' });
  }
  // Вызываем redrawCanvas один раз в конце, после возможной асинхронной загрузки карты
   redrawCanvas();
};

const saveData = async () => {
   // 1. Проверка наличия карты (остается)
   if (!mapImageSrc.value) {
       await Toast.show({ text: 'Нет карты для сохранения.', duration: 'short'});
       return;
   }

   console.log('Сохранение ВСЕХ данных...');
   try {
       // 2. Сохраняем Карту (как было)
       const writeResult = await Filesystem.writeFile({
           path: SAVED_MAP_FILENAME,
           data: mapImageSrc.value,
           directory: Directory.Data,
           encoding: Encoding.UTF8,
           recursive: true
       });
       await Preferences.set({ key: MAP_IMAGE_URI_KEY, value: writeResult.uri });
       console.log('Файл карты сохранен:', writeResult.uri);

       // 3. Сохраняем Секции (как было)
       await Preferences.set({ key: MAP_SECTIONS_KEY, value: JSON.stringify(sections.value) });
       console.log('Секции сохранены.');

       // 4. Сохраняем Товары (ЛОГИКА ИЗ УДАЛЕННОЙ saveProductsData)
       console.log('Товары ПЕРЕД сохранением в Preferences:', JSON.stringify(products.value));
       await Preferences.set({
           key: PRODUCTS_KEY,
           value: JSON.stringify(products.value) // Сохраняем текущий массив товаров
       });
       console.log('Товары сохранены.');

       // 5. Показываем общее сообщение
       await Toast.show({ text: 'Все данные успешно сохранены!', duration: 'short' });

   } catch (error) {
        console.error("Ошибка при сохранении данных:", error);
        // Можно сделать сообщение более детальным, если нужно
        await Toast.show({ text: 'Ошибка сохранения данных!', duration: 'long' });
   }
};

</script>

<style scoped>
 /* Стили для map-editor-container и canvas */
 .map-editor-container {
   margin-top: 20px;
   touch-action: none;
   overflow: auto;
   max-height: 60vh;
   display: flex;
   justify-content: center;
   align-items: center;
   background-color: #f0f0f0; /* Фон для контейнера, если карта меньше */
 }
 canvas {
     cursor: crosshair;
     display: block; /* Убирает лишний отступ под canvas */
 }
 /* Стили для списка товаров */
 ion-list-header {
   align-items: center;
 }
 ion-list-header ion-button {
   margin: 0;
   --padding-start: 5px;
   --padding-end: 5px;
   height: 24px;
 }
 ion-item p {
     font-size: 0.8em;
     color: var(--ion-color-medium-shade);
 }
 /* Стили для списка секций */
 ul {
    list-style-type: none;
    padding-left: 0;
 }
 li {
    padding: 2px 0;
 }
 hr {
    border: none;
    border-top: 1px solid var(--ion-color-step-200, #cccccc);
 }
</style>
