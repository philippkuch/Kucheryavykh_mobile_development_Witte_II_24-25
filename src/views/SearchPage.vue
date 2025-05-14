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
          @ionFocus="handleFocus"
          data-testid="search-input"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="ion-padding" style="position: relative;">

      <ion-list
        data-testid="suggestions-list"
        v-if="suggestions.length > 0"
        class="suggestions-list"
        lines="full"
        inset="false"
      >
        <ion-item
          v-for="suggestion in suggestions"
          :key="suggestion.id + '-suggestion'"
          button
          @click="selectSuggestion(suggestion)"
          detail="false"
          :data-testid="`suggestion-item-${suggestion.id}`" >
          <ion-label>{{ suggestion.name }}</ion-label>
        </ion-item>
      </ion-list>

      <div data-testid="list-input-section" v-if="suggestions.length === 0 && !searchQuery">
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
            data-testid="list-input" ></ion-textarea>
        </ion-item>
        <ion-button
          expand="block"
          @click="findFromList"
          :disabled="!listInput.trim()"
          class="ion-margin-top"
          data-testid="find-from-list-button" >
          Найти по списку
        </ion-button>
        <hr style="margin: 15px 0;">
      </div>

      <ion-list data-testid="search-results-list" lines="inset" v-if="suggestions.length === 0 && searchQuery">
        <ion-list-header v-if="filteredProducts.length > 0">
          <ion-label>Результаты поиска по названию</ion-label>
        </ion-list-header>

        <ion-item data-testid="loading-indicator" v-if="isLoading">
          <ion-spinner name="crescent" slot="start"></ion-spinner>
          <ion-label>Загрузка товаров...</ion-label>
        </ion-item>

        <ion-item data-testid="no-results-message" v-else-if="filteredProducts.length === 0 && !isLoading && allProducts.length > 0">
          <ion-label class="ion-text-center ion-text-wrap">
            <p>По запросу "{{ searchQuery }}" ничего не найдено.</p>
          </ion-label>
        </ion-item>

        <ion-item data-testid="no-products-available" v-else-if="allProducts.length === 0 && !isLoading">
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
          :data-testid="`result-item-${product.id}`"
        >
          <ion-label> <h2>{{ product.name }}</h2> </ion-label>
        </ion-item>
      </ion-list>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSearchbar, IonList, IonListHeader, IonItem, IonLabel, IonSpinner,
  IonTextarea, IonButton,
} from '@ionic/vue';
// Импорт оберток для доступа к Preferences и Toast API, обеспечивающих работу в тестовом окружении.
import { AppPreferences, AppToast } from '@/utils/capacitor-wrappers';
// useRouter для навигации, useSearchResults для обмена данными о результатах поиска с другими компонентами.
import { useRouter } from 'vue-router';
import { useSearchResults, SearchResultItem } from '@/services/search-results.service';

// Интерфейс, описывающий структуру объекта товара в приложении.
interface Product {
  id: string;
  name: string;
  sectionNames: string[];
}
// Ключ для доступа к списку товаров в Preferences.
const PRODUCTS_KEY = 'storeProducts';

// Реактивные переменные для управления состоянием страницы поиска.
const allProducts = ref<Product[]>([]); // Полный список всех товаров, загружаемых из Preferences.
const searchQuery = ref(''); // Текущий поисковый запрос, введенный пользователем в ion-searchbar.
const listInput = ref(''); // Текст, введенный пользователем в ion-textarea для поиска по списку.
const isLoading = ref(true); // Флаг состояния загрузки данных о товарах.
const router = useRouter(); // Экземпляр роутера для осуществления навигации.
const { setResults, clearResults } = useSearchResults(); // Функции из сервиса для управления состоянием результатов поиска.
const suggestions = ref<Product[]>([]); // Список подсказок, отображаемый при вводе в поисковую строку.
let hideSuggestionsTimeout: number | undefined = undefined; // Таймаут для скрытия списка подсказок.

// Хук жизненного цикла: загрузка данных о товарах при монтировании компонента.
// Также очищает предыдущие результаты поиска из общего сервиса.
onMounted(async () => {
    await loadProductData();
    clearResults();
});

// Асинхронная функция для загрузки списка товаров из Preferences.
// Обновляет allProducts и управляет флагом isLoading.
const loadProductData = async () => {
  isLoading.value = true;
  try {
    const productsResult = await AppPreferences.get({ key: PRODUCTS_KEY });
    if (productsResult.value) {
      try {
        allProducts.value = JSON.parse(productsResult.value);
      } catch (e) {
        allProducts.value = [];
        await AppToast.show({ text: 'Ошибка загрузки списка товаров', duration: 'long', position: 'bottom'});
      }
    } else {
      allProducts.value = [];
    }
  } catch (error) {
    allProducts.value = [];
    await AppToast.show({ text: 'Не удалось получить список товаров', duration: 'long', position: 'bottom'});
  } finally {
    isLoading.value = false;
  }
};

// Вычисляемое свойство для фильтрации товаров на основе searchQuery.
// Отображает результаты, если нет активных подсказок и введен поисковый запрос.
// Поиск осуществляется по частичному совпадению (includes) без учета регистра.
const filteredProducts = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  // Не отображаем основные результаты, если есть активные подсказки, запрос пуст или идет загрузка.
  if (!query || suggestions.value.length > 0 || isLoading.value) {
      return [];
  }
  if (!allProducts.value || allProducts.value.length === 0) {
      return [];
  }
  return allProducts.value.filter(product =>
      product && product.name && typeof product.name === 'string' &&
      product.name.toLowerCase().includes(query)
  );
});

// Наблюдатель (watcher) за изменениями в searchQuery.
// Генерирует список подсказок (suggestions) на основе введенного текста.
// Подсказки формируются из товаров, название которых начинается (startsWith) с введенного запроса.
watch(searchQuery, async (newQueryValue) => {
  if (hideSuggestionsTimeout) { // Отмена предыдущего таймаута скрытия подсказок, если он был.
      clearTimeout(hideSuggestionsTimeout);
      hideSuggestionsTimeout = undefined;
  }
  const query = (newQueryValue || '').toLowerCase().trim();
  if(query) { listInput.value = ''; } // Очищаем поле для списка, если пользователь начал вводить в поисковую строку.

  if (!query) { // Если запрос пуст, очищаем подсказки.
      suggestions.value = [];
      return;
  }

  await nextTick(); // Ожидаем обновления DOM перед фильтрацией.

  if (!allProducts.value) {
      suggestions.value = [];
  } else {
      // Фильтруем товары для подсказок: имя товара должно начинаться с запроса. Ограничиваем 5 подсказками.
      suggestions.value = allProducts.value.filter(product =>
          product && product.name && typeof product.name === 'string' &&
          product.name.toLowerCase().startsWith(query)
      ).slice(0, 5);
  }
});

// Функция для скрытия списка подсказок с небольшой задержкой.
// Это позволяет пользователю успеть кликнуть на подсказку до того, как она исчезнет после потери фокуса.
const hideSuggestionsDebounced = () => {
    hideSuggestionsTimeout = window.setTimeout(() => {
        suggestions.value = [];
        hideSuggestionsTimeout = undefined;
    }, 150); // Задержка в 150 мс.
};

// Обработчик события фокуса на поисковой строке.
// Если есть активный запрос и подсказки были скрыты, пытается их восстановить.
const handleFocus = async () => {
  if (hideSuggestionsTimeout) { // Предотвращаем скрытие подсказок, если пользователь быстро вернул фокус.
    clearTimeout(hideSuggestionsTimeout);
    hideSuggestionsTimeout = undefined;
  }
  const query = searchQuery.value.toLowerCase().trim();
  // Если есть текст в поиске и подсказок нет, (пере)генерируем их.
  if (query && suggestions.value.length === 0) {
      await nextTick();
      if (!allProducts.value) {
          suggestions.value = [];
      } else {
          suggestions.value = allProducts.value.filter(product =>
              product && product.name && typeof product.name === 'string' &&
              product.name.toLowerCase().startsWith(query)
          ).slice(0, 5);
      }
  }
}

// Обработчик выбора подсказки из списка.
// Устанавливает поисковый запрос равным выбранной подсказке, очищает список подсказок и переходит на карту.
const selectSuggestion = (suggestion: Product) => {
    if (hideSuggestionsTimeout) { // Очищаем таймаут, так как выбор сделан.
        clearTimeout(hideSuggestionsTimeout);
        hideSuggestionsTimeout = undefined;
    }
    searchQuery.value = suggestion.name;
    suggestions.value = []; // Скрываем список подсказок.
    goToMap(suggestion); // Переходим на карту с выбранным товаром.
};

// Обработчик очистки поисковой строки (клик на крестик в ion-searchbar).
// Также очищает поле для ввода списка.
const onSearchbarClear = () => {
    listInput.value = '';
};

// Осуществляет переход на страницу карты (MapPage).
// Передает информацию о найденном товаре и его секциях через сервис search-results.service и query-параметры роутера.
const goToMap = async (product: Product) => {
  if (document.activeElement && document.activeElement instanceof HTMLElement) { // Убираем фокус с активного элемента (например, searchbar).
      document.activeElement.blur();
  }

  if (product && product.sectionNames && product.sectionNames.length > 0) {
      // Если товар найден и у него есть секции, формируем результат и параметры для навигации.
      const resultItem: SearchResultItem = { productName: product.name, sectionNames: product.sectionNames, found: true };
      setResults([resultItem]); // Сохраняем результат в сервис.
      const sectionNamesParam = product.sectionNames.join('|'); // Секции передаются как строка, разделенная '|'.
      await router.push({ name: 'Map', query: { sections: sectionNamesParam } });
  } else {
      // Если товар не найден или у него нет секций.
      const resultItem: SearchResultItem = { productName: product?.name ?? 'Не найден', sectionNames: [], found: !!product };
      setResults([resultItem]);
      await router.push({ name: 'Map' }); // Переход на карту без указания секций.

      if (product) { // Если товар был, но без секций, показываем уведомление.
        await AppToast.show({
            text: `Для товара "${product.name}" не указаны секции.`,
            duration: 'long',
            position: 'bottom'
        });
      }
  }
};

// Обрабатывает поиск по списку товаров, введенному в ion-textarea.
// Находит все совпадения, собирает уникальные секции и переходит на карту, передавая эти секции.
const findFromList = async () => {
    const inputText = listInput.value.trim();
    if (!inputText) return; // Ничего не делаем, если поле пустое.

    searchQuery.value = ''; // Очищаем основной поисковый запрос.
    suggestions.value = []; // Очищаем подсказки.

    // Разбиваем введенный текст на отдельные названия товаров.
    const inputProductNames = inputText.split('\n')
                                      .map(name => name.trim())
                                      .filter(name => name.length > 0);

    if (inputProductNames.length === 0) return;

    await nextTick();
    const currentProductList = allProducts.value; // Используем актуальный список всех товаров.

    // Проверки на случай, если данные еще загружаются или список товаров пуст.
    if (isLoading.value) {
        await AppToast.show({text: 'Подождите, идет загрузка товаров...', duration: 'long', position: 'bottom'});
        return;
    }
    if (!currentProductList || currentProductList.length === 0) {
        await AppToast.show({text: 'Список товаров пуст. Невозможно выполнить поиск.', duration: 'long', position: 'bottom'});
        return;
    }

    const resultsForService: SearchResultItem[] = []; // Результаты для передачи в сервис.
    const allFoundSectionNames = new Set<string>(); // Множество для хранения уникальных имен найденных секций.

    inputProductNames.forEach(inputName => {
        const inputNameLower = inputName.toLowerCase();
        // Ищем совпадения по каждому введенному имени (частичное совпадение).
        const foundProducts = currentProductList.filter(p =>
            p && p.name && typeof p.name === 'string' &&
            p.name.toLowerCase().includes(inputNameLower)
        );
        let sectionsForThisProduct = new Set<string>();
        let foundFlag = foundProducts.length > 0;

        if (foundFlag) {
            foundProducts.forEach(product => {
                if (product && Array.isArray(product.sectionNames)) {
                    product.sectionNames.forEach(sectionName => {
                        allFoundSectionNames.add(sectionName); // Добавляем в общий список секций для подсветки.
                        sectionsForThisProduct.add(sectionName); // Секции для конкретного товара из списка.
                    });
                }
            });
        }
        resultsForService.push({
            productName: inputName,
            sectionNames: Array.from(sectionsForThisProduct),
            found: foundFlag
        });
    });

    setResults(resultsForService); // Сохраняем все результаты в сервис.

    // Если найдены какие-либо секции, переходим на карту с их указанием.
    if (allFoundSectionNames.size > 0) {
        const sectionNamesArray = Array.from(allFoundSectionNames);
        const sectionNamesParam = sectionNamesArray.join('|');
        await router.push({ name: 'Map', query: { sections: sectionNamesParam } });
    } else { // Иначе переходим на карту без указания секций.
        await router.push({ name: 'Map' });
        // Если ни один товар из списка не был найден, показываем уведомление.
        const noneFound = resultsForService.every(r => !r.found);
        if(noneFound){
            await AppToast.show({
                text: 'Не найдено расположение ни для одного товара из списка.',
                duration: 'long',
                position: 'bottom'
            });
        }
    }
    listInput.value = ''; // Очищаем поле ввода списка.
};

</script>

<style scoped>
/* Стили для компонента страницы поиска. */
ion-content {
  --padding-bottom: 16px;
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
/* Стили для выпадающего списка подсказок. */
.suggestions-list {
  position: absolute; /* Позиционируется относительно родительского ion-content. */
  left: var(--padding-start, 16px);
  right: var(--padding-end, 16px);
  margin-top: 5px;
  z-index: 1000; /* Должен быть поверх других элементов. */
  background: var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--ion-color-step-200, #cccccc);
  border-radius: 6px;
  max-height: 250px; /* Ограничение высоты списка с прокруткой. */
  overflow-y: auto;
}
.suggestions-list ion-item {
  --padding-start: 12px;
  --padding-end: 12px;
  --min-height: 40px;
  font-size: 0.9em;
  --inner-border-width: 0 0 0.55px 0; /* Тонкая линия между элементами. */
  --border-color: var(--ion-color-step-150, #e0e0e0);
}
.suggestions-list ion-item:last-child {
    --inner-border-width: 0; /* Убираем линию у последнего элемента. */
}
/* Глобальные отступы для хост-элемента, если это Custom Element. */
/* Для обычного Vue компонента это может не иметь эффекта без Shadow DOM. */
:host {
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 16px;
}
/* Этот селектор нужен, чтобы стандартный padding от ion-padding в ion-content не конфликтовал с position:absolute у suggestions-list */
ion-content.ion-padding { }
</style>