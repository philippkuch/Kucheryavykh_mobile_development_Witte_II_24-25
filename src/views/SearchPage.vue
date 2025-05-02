<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Поиск Товаров</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          v-model="searchQuery"
          placeholder="Введите название товара"
          :debounce="300"
          show-clear-button="always"
          animated
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="ion-padding">

      <hr style="margin: 15px 0;">

      <ion-item lines="none">
          <ion-label position="stacked">Или вставьте список (каждый товар с новой строки):</ion-label>
          <ion-textarea
              v-model="listInput"
              placeholder="Молоко&#10;Хлеб&#10;Яйца"
              :rows="4"
              :auto-grow="true"
              inputmode="text"
              enterkeyhint="done"
          ></ion-textarea>
      </ion-item>

      <ion-button
          expand="block"
          @click="findFromList"
          :disabled="!listInput.trim()"
          class="ion-margin-top"
      >
          Найти по списку
      </ion-button>

      <hr style="margin: 15px 0;">
      <ion-list lines="inset">
        <ion-list-header v-if="searchQuery && filteredProducts.length > 0">
          <ion-label>Результаты поиска по названию</ion-label>
        </ion-list-header>

        <ion-item v-if="isLoading">
            <ion-spinner name="crescent" slot="start"></ion-spinner>
            <ion-label>Загрузка товаров...</ion-label>
        </ion-item>

        <ion-item v-else-if="filteredProducts.length === 0 && searchQuery && !isLoading && allProducts.length > 0 && !listInput.trim()">
             <ion-label class="ion-text-center ion-text-wrap">
                 <p>По запросу "{{ searchQuery }}" ничего не найдено.</p>
             </ion-label>
        </ion-item>

         <ion-item v-else-if="allProducts.length === 0 && !isLoading">
              <ion-label class="ion-text-center ion-text-wrap">
                  <p>Оператор еще не добавил товары.</p>
              </ion-label>
         </ion-item>


        <ion-item
          v-if="!listInput.trim()"
          v-for="product in filteredProducts"
          :key="product.id"
          button
          @click="goToMap(product)"
          detail="false"
        >
          <ion-label>
            <h2>{{ product.name }}</h2>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonList, IonListHeader, IonItem, IonLabel, IonSpinner,
  IonTextarea, IonButton
} from '@ionic/vue';
import { Toast } from '@capacitor/toast';
import { Preferences } from '@capacitor/preferences';
import { useRouter } from 'vue-router';
// --- Импортируем сервис и тип ---
import { useSearchResults, SearchResultItem } from '@/services/search-results.service'; // Путь к сервису

// --- Интерфейс Product (можно вынести) ---
interface Product { id: string; name: string; sectionNames: string[]; }
const PRODUCTS_KEY = 'storeProducts';

// --- Refs ---
const allProducts = ref<Product[]>([]);
const searchQuery = ref(''); // Для поиска по строке
const listInput = ref('');   // Для поиска по списку
const isLoading = ref(true);
const router = useRouter();
// --- Получаем доступ к функциям сервиса ---
const { setResults, clearResults } = useSearchResults();

// --- Жизненный цикл и Загрузка данных ---
onMounted(async () => {
    await loadProductData();
    clearResults(); // Очищаем предыдущие результаты поиска при входе на страницу
});

const loadProductData = async () => {
  isLoading.value = true;
  console.log('SearchPage: Загрузка товаров...');
  try {
    const productsResult = await Preferences.get({ key: PRODUCTS_KEY });
    if (productsResult.value) {
      try { allProducts.value = JSON.parse(productsResult.value); console.log('SearchPage: Товары загружены:', allProducts.value.length); }
      catch (e) { console.error('SearchPage: Ошибка парсинга товаров:', e); allProducts.value = []; }
    } else { allProducts.value = []; console.log('SearchPage: Сохраненные товары не найдены.'); }
  } catch (error) { console.error("SearchPage: Ошибка при загрузке товаров:", error); allProducts.value = []; }
  finally { isLoading.value = false; }
};

// --- Поиск по строке ---
const filteredProducts = computed(() => {
  const listQuery = listInput.value.trim();
  // Если пользователь ввел что-то в поле списка, НЕ показываем результаты поиска по строке
  if (listQuery) {
      return [];
  }
  const query = searchQuery.value.toLowerCase().trim();
  // Если запрос в строке поиска пуст, тоже ничего не показываем
  if (!query) {
      return [];
  }
  // Фильтруем по имени товара
  return allProducts.value.filter(product =>
      product.name.toLowerCase().includes(query)
  );
});

// --- Переход на карту для одного товара ---
const goToMap = (product: Product) => {
  console.log('Выбран товар:', product);
  if (product.sectionNames && product.sectionNames.length > 0) {
      // --- Сохраняем результат в сервис ---
      const resultItem: SearchResultItem = {
          productName: product.name,
          sectionNames: product.sectionNames,
          found: true
      };
      console.log('SearchPage -> goToMap: ПЕРЕД setResults:', JSON.parse(JSON.stringify(resultItem)));
      setResults([resultItem]); // Устанавливаем результат для одного товара
      console.log('SearchPage -> goToMap: ПОСЛЕ setResults');
      // ------------------------------------

      const sectionNamesParam = product.sectionNames.join('|');
      router.push({ name: 'Map', query: { sections: sectionNamesParam } });
      if (document.activeElement && document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
  } else {
      Toast.show({ message: `Для товара "${product.name}" не указаны секции.`, duration: 3000, color: 'warning' });
  }
};

// --- Функция для поиска по списку ---
const findFromList = async () => {
    const inputText = listInput.value.trim();
    if (!inputText) return;
    console.log("Поиск по списку:", inputText);

    // Очищаем результаты поиска по строке, когда ищем по списку
    searchQuery.value = '';

    // inputProductNames сохраняет оригинальный регистр для отображения
    const inputProductNames = inputText
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (inputProductNames.length === 0) return;
    console.log("Ищем товары:", inputProductNames);

    const resultsForService: SearchResultItem[] = [];
    const allFoundSectionNames = new Set<string>();

    inputProductNames.forEach(inputName => {
        const inputNameLower = inputName.toLowerCase(); // Для поиска без учета регистра
        const foundProducts = allProducts.value.filter(p =>
            p.name.toLowerCase().includes(inputNameLower)
        );

        let sectionsForThisProduct = new Set<string>(); // Используем Set для уникальности секций этого товара
        let foundFlag = false;

        if (foundProducts.length > 0) {
            console.log(`Найден(ы) товары для "${inputName}":`, foundProducts.map(p=>p.name));
            foundFlag = true;
            foundProducts.forEach(product => {
                product.sectionNames.forEach(sectionName => {
                    allFoundSectionNames.add(sectionName); // Собираем ВСЕ уникальные секции для URL
                    sectionsForThisProduct.add(sectionName); // Собираем уникальные секции для ЭТОГО товара
                });
            });
        } else {
             console.log(`Товары для "${inputName}" не найдены.`);
        }

        // Добавляем результат в массив для сервиса
        resultsForService.push({
            productName: inputName, // Отображаем имя, как ввел пользователь
            sectionNames: Array.from(sectionsForThisProduct), // Преобразуем Set в массив
            found: foundFlag
        });
    });

    if (allFoundSectionNames.size > 0) {
        // --- Сохраняем результаты в сервис ---
        console.log('SearchPage -> findFromList: ПЕРЕД setResults:', JSON.parse(JSON.stringify(resultsForService)));
        setResults(resultsForService);
        console.log('SearchPage -> findFromList: ПОСЛЕ setResults');
        // -----------------------------------

        const sectionNamesArray = Array.from(allFoundSectionNames);
        const sectionNamesParam = sectionNamesArray.join('|');
        console.log("Переход на карту с секциями:", sectionNamesArray);
        router.push({
            name: 'Map',
            query: { sections: sectionNamesParam }
        });
    } else {
        console.log("Не найдено секций для отображения на карте.");
        // Очищаем результаты в сервисе, если ничего не найдено
        clearResults();
        await Toast.show({
            message: 'Не найдено расположение для товаров из списка.',
            duration: 3000,
            color: 'warning'
        });
    }
};

</script>

<style scoped>
ion-content.ion-padding { --padding-top: 16px; }
ion-list-header { font-weight: bold; }
ion-textarea {
    border: 1px solid var(--ion-color-step-250, #cccccc);
    border-radius: 6px;
    margin-top: 4px;
    --padding-start: 8px;
    --padding-end: 8px;
    --padding-top: 8px;
    --padding-bottom: 8px;
}
hr {
    border: none;
    border-top: 1px solid var(--ion-color-step-150, #eeeeee);
 }
 /* Дополнительные стили, если нужны */
</style>
