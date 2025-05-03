<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Поиск Товаров</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          v-model="searchQuery"
          :debounce="300"
          placeholder="Введите название товара"
          show-clear-button="always"
          animated
          @ionClear="onSearchbarClear"
          @ionBlur="hideSuggestionsDebounced"
          @ionFocus="handleFocus" ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="ion-padding" style="position: relative;">

      <ion-list v-if="suggestions.length > 0" class="suggestions-list" lines="full" inset="false"> <ion-item
            v-for="suggestion in suggestions"
            :key="suggestion.id + '-suggestion'" button
            @click="selectSuggestion(suggestion)"
            detail="false"
          >
            <ion-label>{{ suggestion.name }}</ion-label>
          </ion-item>
      </ion-list>

      <div v-if="suggestions.length === 0 && !searchQuery">
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
      </div>

      <ion-list lines="inset" v-if="suggestions.length === 0 && searchQuery">
        <ion-list-header v-if="filteredProducts.length > 0">
          <ion-label>Результаты поиска по названию</ion-label>
        </ion-list-header>

        <ion-item v-if="isLoading">
            <ion-spinner name="crescent" slot="start"></ion-spinner>
            <ion-label>Загрузка товаров...</ion-label>
        </ion-item>

        <ion-item v-else-if="filteredProducts.length === 0 && !isLoading && allProducts.length > 0">
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
          v-for="product in filteredProducts"
          :key="product.id"
          button
          @click="goToMap(product)"
          detail="false"
        >
          <ion-label> <h2>{{ product.name }}</h2> </ion-label>
        </ion-item>
      </ion-list>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'; // Добавлен watch
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonList, IonListHeader, IonItem, IonLabel, IonSpinner,
  IonTextarea, IonButton,
} from '@ionic/vue';
import { Preferences } from '@capacitor/preferences';
import { useRouter } from 'vue-router';
import { Toast } from '@capacitor/toast'; // Правильный импорт Capacitor Toast
import { useSearchResults, SearchResultItem } from '@/services/search-results.service';

// --- Интерфейс Product ---
interface Product {
  id: string;
  name: string;
  sectionNames: string[];
}
const PRODUCTS_KEY = 'storeProducts';

// --- Refs ---
const allProducts = ref<Product[]>([]);
const searchQuery = ref(''); // Управляется через v-model
const listInput = ref('');
const isLoading = ref(true);
const router = useRouter();
const { setResults, clearResults } = useSearchResults();
const suggestions = ref<Product[]>([]); // Для подсказок
let hideSuggestionsTimeout: number | undefined = undefined; // Таймаут для скрытия подсказок

// --- Жизненный цикл и Загрузка данных ---
onMounted(async () => {
    await loadProductData();
    clearResults(); // Очищаем результаты предыдущего поиска при монтировании
});

// --- Функция загрузки товаров ---
const loadProductData = async () => {
  isLoading.value = true;
  console.log('SearchPage: Загрузка товаров...');
  try {
    const productsResult = await Preferences.get({ key: PRODUCTS_KEY });
    if (productsResult.value) {
      try {
        allProducts.value = JSON.parse(productsResult.value);
        console.log('SearchPage: Товары загружены:', allProducts.value.length);
      } catch (e) {
        console.error('SearchPage: Ошибка парсинга товаров:', e);
        allProducts.value = [];
        await Toast.show({ text: 'Ошибка загрузки списка товаров', duration: 2000, position: 'bottom'});
      }
    } else {
      allProducts.value = [];
      console.log('SearchPage: Сохраненные товары не найдены.');
    }
  } catch (error) {
    console.error("SearchPage: Ошибка при загрузке товаров из Preferences:", error);
    allProducts.value = [];
    await Toast.show({ text: 'Не удалось получить список товаров', duration: 2000, position: 'bottom'});
  } finally {
    isLoading.value = false;
  }
};

// --- Вычисляемое свойство для ОСНОВНЫХ результатов поиска ---
// Показывает результаты только если НЕТ активных подсказок и есть поисковый запрос
const filteredProducts = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query || suggestions.value.length > 0 || isLoading.value) {
      return [];
  }
  // Фильтр по вхождению строки для основного списка
  return allProducts.value.filter(product => product.name.toLowerCase().includes(query));
});

// --- Watch для генерации ПОДСКАЗОК при изменении searchQuery ---
watch(searchQuery, (newQueryValue) => {
  // Отменяем предыдущий таймаут скрытия, если он был
  if (hideSuggestionsTimeout) {
      clearTimeout(hideSuggestionsTimeout);
      hideSuggestionsTimeout = undefined;
  }

  const query = (newQueryValue || '').toLowerCase().trim();

  // Очищаем поле списка, если начали вводить в поиск
  if(query) { listInput.value = ''; }

  if (!query) {
      suggestions.value = []; // Очищаем подсказки, если запрос пуст
      return;
  }

  // Фильтруем по НАЧАЛУ строки для подсказок (более релевантно)
  suggestions.value = allProducts.value.filter(product =>
      product.name.toLowerCase().startsWith(query)
  ).slice(0, 5); // Ограничиваем количество подсказок (например, 5)
  console.log('Suggestions updated:', suggestions.value.length);
});

// --- Функция скрытия подсказок при потере фокуса (с задержкой) ---
const hideSuggestionsDebounced = () => {
    // Ставим таймаут перед скрытием
    hideSuggestionsTimeout = window.setTimeout(() => {
        console.log('Hiding suggestions on blur timeout');
        suggestions.value = [];
        hideSuggestionsTimeout = undefined;
    }, 150); // Задержка в мс (чтобы клик успел сработать)
};

// --- Функция, вызываемая при получении фокуса полем поиска ---
// Нужна, чтобы отменить скрытие по таймауту, если пользователь быстро кликнул вне поля, а потом вернулся
const handleFocus = () => {
  if (hideSuggestionsTimeout) {
    clearTimeout(hideSuggestionsTimeout);
    hideSuggestionsTimeout = undefined;
  }
  // Если в поле уже что-то есть, можно снова показать подсказки
  const query = searchQuery.value.toLowerCase().trim();
  if (query && suggestions.value.length === 0) { // Показываем, только если их нет
      suggestions.value = allProducts.value.filter(product =>
          product.name.toLowerCase().startsWith(query)
      ).slice(0, 5);
      console.log('Suggestions restored on focus');
  }
}

// --- Выбор подсказки из выпадающего списка ---
const selectSuggestion = (suggestion: Product) => {
    if (hideSuggestionsTimeout) { // Отменяем скрытие по blur, если оно было запущено
        clearTimeout(hideSuggestionsTimeout);
        hideSuggestionsTimeout = undefined;
    }
    console.log('Suggestion selected:', suggestion.name);
    searchQuery.value = suggestion.name; // Обновляем searchQuery (v-model обновит поле ввода)
    suggestions.value = []; // Сразу скрываем список подсказок
    goToMap(suggestion); // Сразу переходим на карту с выбранным товаром
};

// --- Функция очистки searchbar (вызывается из @ionClear) ---
const onSearchbarClear = () => {
    console.log('Searchbar cleared');
    // searchQuery уже будет очищен через v-model
    // suggestions очистятся через watch, когда searchQuery станет ''
    listInput.value = ''; // На всякий случай очистим и поле списка
    // suggestions.value = []; // Можно и явно очистить здесь
};

// --- Переход на карту ---
const goToMap = async (product: Product) => {
  console.log('Выбран товар (goToMap):', product.name);
  // Убираем фокус с поля ввода, чтобы клавиатура скрылась (особенно важно на мобильных)
  if (document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
  }

  if (product.sectionNames && product.sectionNames.length > 0) {
      const resultItem: SearchResultItem = { productName: product.name, sectionNames: product.sectionNames, found: true };
      setResults([resultItem]); // Сохраняем результат для страницы карты
      const sectionNamesParam = product.sectionNames.join('|'); // Кодируем секции для URL
      console.log(`Navigating to Map with sections: ${sectionNamesParam}`);
      await router.push({ name: 'Map', query: { sections: sectionNamesParam } }); // Асинхронный переход
  } else {
      console.warn(`Для товара "${product.name}" не указаны секции.`);
      await Toast.show({
          text: `Для товара "${product.name}" не указаны секции.`,
          duration: 3000,
          position: 'bottom'
          // color нет в стандартном Capacitor Toast API, он может быть в плагинах
      });
  }
};

// --- Функция для поиска по списку из textarea ---
const findFromList = async () => {
    const inputText = listInput.value.trim();
    if (!inputText) return;

    console.log("Поиск по списку:", inputText);
    searchQuery.value = ''; // Очищаем поле поиска
    suggestions.value = []; // Очищаем подсказки

    const inputProductNames = inputText.split('\n')
                                      .map(name => name.trim())
                                      .filter(name => name.length > 0);

    if (inputProductNames.length === 0) return;
    console.log("Ищем товары из списка:", inputProductNames);

    if (isLoading.value) {
        await Toast.show({text: 'Подождите, идет загрузка товаров...', duration: 2000, position: 'bottom'});
        return;
    }
     if (allProducts.value.length === 0) {
        await Toast.show({text: 'Список товаров пуст. Невозможно выполнить поиск.', duration: 2000, position: 'bottom'});
        return;
    }


    const resultsForService: SearchResultItem[] = [];
    const allFoundSectionNames = new Set<string>();

    inputProductNames.forEach(inputName => {
        const inputNameLower = inputName.toLowerCase();
        // Ищем совпадения (можно сделать более строгий поиск, если нужно)
        const foundProducts = allProducts.value.filter(p => p.name.toLowerCase().includes(inputNameLower));

        let sectionsForThisProduct = new Set<string>();
        let foundFlag = foundProducts.length > 0;

        if (foundFlag) {
            console.log(`Найден(ы) товары для "${inputName}":`, foundProducts.map(p => p.name));
            foundProducts.forEach(product => {
                product.sectionNames.forEach(sectionName => {
                    allFoundSectionNames.add(sectionName);
                    sectionsForThisProduct.add(sectionName);
                });
            });
        } else {
            console.log(`Товары для "${inputName}" не найдены.`);
        }
        resultsForService.push({
            productName: inputName,
            sectionNames: Array.from(sectionsForThisProduct),
            found: foundFlag
        });
    });

    if (allFoundSectionNames.size > 0) {
        setResults(resultsForService); // Сохраняем результаты для карты
        const sectionNamesArray = Array.from(allFoundSectionNames);
        const sectionNamesParam = sectionNamesArray.join('|');
        console.log("Переход на карту с секциями из списка:", sectionNamesArray);
        await router.push({ name: 'Map', query: { sections: sectionNamesParam } });
    } else {
        console.log("Не найдено секций для товаров из списка.");
        clearResults(); // Очищаем сервис результатов
        await Toast.show({
            text: 'Не найдено расположение ни для одного товара из списка.',
            duration: 3000,
            position: 'bottom'
        });
    }
    listInput.value = ''; // Очищаем поле ввода списка после поиска
};

</script>

<style scoped>
/* Убедимся, что контент может быть под списком */
ion-content {
  --padding-bottom: 16px; /* Добавим немного отступа снизу */
}

ion-list-header {
  font-weight: bold;
}

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

/* Стили для списка подсказок */
.suggestions-list {
  position: absolute; /* Позиционируем абсолютно относительно ion-content */
  left: var(--padding-start, 16px); /* Отступы как у контента */
  right: var(--padding-end, 16px);
  /* top: отступ от searchbar - можно подобрать точнее или оставить авто */
  /* Вместо top можно использовать margin-top, если он не будет перекрывать searchbar */
  margin-top: 5px; /* Небольшой отступ сверху */
  z-index: 1000; /* Поверх остального контента */
  background: var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--ion-color-step-200, #cccccc);
  border-radius: 6px;
  max-height: 250px; /* Ограничение высоты */
  overflow-y: auto; /* Скролл при необходимости */
}

.suggestions-list ion-item {
  --padding-start: 12px; /* Уменьшим отступы внутри подсказок */
  --padding-end: 12px;
  --min-height: 40px;  /* Сделаем строки чуть ниже */
  font-size: 0.9em;   /* Шрифт чуть меньше */
  --inner-border-width: 0 0 0.55px 0; /* Тонкая линия снизу, кроме последнего */
  --border-color: var(--ion-color-step-150, #e0e0e0); /* Цвет линии */
}

.suggestions-list ion-item:last-child {
    --inner-border-width: 0; /* Убираем линию у последнего элемента */
}

/* Дополнительно: Убедимся, что padding у ion-content не влияет на абсолютное позиционирование */
:host {
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 16px;
}

ion-content.ion-padding {
  /* Эти переменные используются для внутренних отступов, не для position:absolute */
}
</style>