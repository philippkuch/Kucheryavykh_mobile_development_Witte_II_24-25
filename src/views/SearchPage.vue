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
import { AppPreferences, AppToast } from '@/utils/capacitor-wrappers';
import { useRouter } from 'vue-router';
import { useSearchResults, SearchResultItem } from '@/services/search-results.service';

interface Product {
  id: string;
  name: string;
  sectionNames: string[];
}
const PRODUCTS_KEY = 'storeProducts';

const allProducts = ref<Product[]>([]);
const searchQuery = ref('');
const listInput = ref('');
const isLoading = ref(true);
const router = useRouter();
const { setResults, clearResults } = useSearchResults();
const suggestions = ref<Product[]>([]);
let hideSuggestionsTimeout: number | undefined = undefined;

onMounted(async () => {
    await loadProductData();
    clearResults();
});

const loadProductData = async () => {
  isLoading.value = true;
  console.log('SearchPage: Загрузка товаров...');
  try {
    const productsResult = await AppPreferences.get({ key: PRODUCTS_KEY });
    if (productsResult.value) {
      try {
        allProducts.value = JSON.parse(productsResult.value);
        console.log('SearchPage: Товары загружены:', allProducts.value.length);
        await nextTick();
        console.log('SearchPage: Длина allProducts после nextTick в loadData:', allProducts.value.length);
      } catch (e) {
        console.error('SearchPage: Ошибка парсинга товаров:', e);
        allProducts.value = [];
        await AppToast.show({ text: 'Ошибка загрузки списка товаров', duration: 'long', position: 'bottom'});
      }
    } else {
      allProducts.value = [];
      console.log('SearchPage: Сохраненные товары не найдены.');
    }
  } catch (error) {
    console.error("SearchPage: Ошибка при загрузке товаров из Preferences:", error);
    allProducts.value = [];
    await AppToast.show({ text: 'Не удалось получить список товаров', duration: 'long', position: 'bottom'});
  } finally {
    isLoading.value = false;
  }
};

const filteredProducts = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query || suggestions.value.length > 0 || isLoading.value) {
      return [];
  }
  if (!allProducts.value || allProducts.value.length === 0) {
      console.warn('filteredProducts computed: allProducts пустой, возвращаем []');
      return [];
  }
  console.log(`filteredProducts computed: Фильтруем ${allProducts.value.length} товаров по запросу "${query}"`);
  return allProducts.value.filter(product =>
      product && product.name && typeof product.name === 'string' &&
      product.name.toLowerCase().includes(query)
  );
});

watch(searchQuery, async (newQueryValue) => {
  console.log(`--- WATCH searchQuery: "${newQueryValue}" ---`);
  if (hideSuggestionsTimeout) {
      clearTimeout(hideSuggestionsTimeout);
      hideSuggestionsTimeout = undefined;
  }
  const query = (newQueryValue || '').toLowerCase().trim();
  if(query) { listInput.value = ''; }

  if (!query) {
      suggestions.value = [];
      console.log('WATCH: Query пустой, suggestions очищены.');
      return;
  }

  await nextTick();
  console.log('WATCH: allProducts ref object:', allProducts);
  console.log('WATCH: allProducts.value before filter:', allProducts.value);
  console.log('WATCH: Длина allProducts перед фильтрацией:', allProducts.value?.length ?? 'undefined');
  console.log('WATCH: filtering with query:', query);

  if (!allProducts.value) {
      console.error("WATCH: allProducts.value не определен!");
      suggestions.value = [];
  } else {
      console.log('WATCH: Начинаем фильтрацию...')
      allProducts.value.forEach(p => {
          if(p && p.name) {
              console.log(`WATCH: Checking product: ${p.name} (${p.name.toLowerCase().startsWith(query)})`);
          } else {
              console.log('WATCH: Checking invalid product:', p);
          }
      });
      suggestions.value = allProducts.value.filter(product =>
          product && product.name && typeof product.name === 'string' &&
          product.name.toLowerCase().startsWith(query)
      ).slice(0, 5);
  }
  console.log('WATCH: Рассчитанные suggestions:', JSON.parse(JSON.stringify(suggestions.value)));
});

const hideSuggestionsDebounced = () => {
    hideSuggestionsTimeout = window.setTimeout(() => {
        console.log('Hiding suggestions on blur timeout');
        suggestions.value = [];
        hideSuggestionsTimeout = undefined;
    }, 150);
};

const handleFocus = async () => {
  console.log('--- handleFocus ---');
  if (hideSuggestionsTimeout) {
    clearTimeout(hideSuggestionsTimeout);
    hideSuggestionsTimeout = undefined;
  }
  const query = searchQuery.value.toLowerCase().trim();
  if (query && suggestions.value.length === 0) {
      await nextTick();
      console.log('handleFocus: Длина allProducts перед восстановлением подсказок:', allProducts.value?.length ?? 'undefined');
      if (!allProducts.value) {
          console.error("handleFocus: allProducts.value не определен!");
          suggestions.value = [];
      } else {
          suggestions.value = allProducts.value.filter(product =>
              product && product.name && typeof product.name === 'string' &&
              product.name.toLowerCase().startsWith(query)
          ).slice(0, 5);
      }
      console.log('Suggestions restored on focus:', JSON.parse(JSON.stringify(suggestions.value)));
  }
}

const selectSuggestion = (suggestion: Product) => {
    if (hideSuggestionsTimeout) {
        clearTimeout(hideSuggestionsTimeout);
        hideSuggestionsTimeout = undefined;
    }
    console.log('Suggestion selected:', suggestion.name);
    searchQuery.value = suggestion.name;
    suggestions.value = [];
    goToMap(suggestion);
};

const onSearchbarClear = () => {
    console.log('Searchbar cleared');
    listInput.value = '';
};

const goToMap = async (product: Product) => {
  console.log('Выбран товар (goToMap):', product.name);
  if (document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
  }

  if (product && product.sectionNames && product.sectionNames.length > 0) {
      const resultItem: SearchResultItem = { productName: product.name, sectionNames: product.sectionNames, found: true };
      setResults([resultItem]);
      const sectionNamesParam = product.sectionNames.join('|');
      console.log(`Navigating to Map with sections: ${sectionNamesParam}`);
      await router.push({ name: 'Map', query: { sections: sectionNamesParam } });
  } else {
      console.warn(`Для товара "${product?.name ?? 'НЕИЗВЕСТНО'}" не указаны секции.`);
      const resultItem: SearchResultItem = { productName: product?.name ?? 'Не найден', sectionNames: [], found: !!product };
      setResults([resultItem]);
      await router.push({ name: 'Map' });

      if (product) {
        await AppToast.show({
            text: `Для товара "${product.name}" не указаны секции.`,
            duration: 'long',
            position: 'bottom'
        });
      }
  }
};

const findFromList = async () => {
    const inputText = listInput.value.trim();
    if (!inputText) return;

    console.log("findFromList: Поиск по списку:", inputText);
    searchQuery.value = '';
    suggestions.value = [];

    const inputProductNames = inputText.split('\n')
                                      .map(name => name.trim())
                                      .filter(name => name.length > 0);

    if (inputProductNames.length === 0) return;
    console.log("findFromList: Ищем товары из списка:", inputProductNames);

    await nextTick();
    const currentProductList = allProducts.value;
    console.log('findFromList: Проверяем isLoading и длину (захваченную) allProducts:', isLoading.value, currentProductList?.length ?? 'undefined');

    if (isLoading.value) {
        console.warn('findFromList: Данные еще загружаются!');
        await AppToast.show({text: 'Подождите, идет загрузка товаров...', duration: 'long', position: 'bottom'});
        return;
    }
    if (!currentProductList || currentProductList.length === 0) {
        console.error('findFromList: Захваченный allProducts пустой или не определен! Поиск невозможен.');
        await AppToast.show({text: 'Список товаров пуст. Невозможно выполнить поиск.', duration: 'long', position: 'bottom'});
        return;
    }

    const resultsForService: SearchResultItem[] = [];
    const allFoundSectionNames = new Set<string>();

    console.log('findFromList: Начинаем перебор inputProductNames...');
    inputProductNames.forEach(inputName => {
        const inputNameLower = inputName.toLowerCase();
        const foundProducts = currentProductList.filter(p =>
            p && p.name && typeof p.name === 'string' &&
            p.name.toLowerCase().includes(inputNameLower)
        );
        let sectionsForThisProduct = new Set<string>();
        let foundFlag = foundProducts.length > 0;

        if (foundFlag) {
            console.log(`findFromList: Найден(ы) товары для "${inputName}":`, foundProducts.map(p => p.name));
            foundProducts.forEach(product => {
                if (product && Array.isArray(product.sectionNames)) {
                    product.sectionNames.forEach(sectionName => {
                        allFoundSectionNames.add(sectionName);
                        sectionsForThisProduct.add(sectionName);
                    });
                }
            });
        } else {
            console.log(`findFromList: Товары для "${inputName}" не найдены.`);
        }
        resultsForService.push({
            productName: inputName,
            sectionNames: Array.from(sectionsForThisProduct),
            found: foundFlag
        });
        console.log(`findFromList: Обработан "${inputName}", найдено: ${foundFlag}`);
    });

    setResults(resultsForService);
    console.log('findFromList: allFoundSectionNames size:', allFoundSectionNames.size);

    if (allFoundSectionNames.size > 0) {
        const sectionNamesArray = Array.from(allFoundSectionNames);
        const sectionNamesParam = sectionNamesArray.join('|');
        console.log('findFromList: Навигация на карту с секциями:', sectionNamesArray);
        await router.push({ name: 'Map', query: { sections: sectionNamesParam } });
    } else {
        console.log('findFromList: Навигация на карту БЕЗ секций');
        await router.push({ name: 'Map' });

        const noneFound = resultsForService.every(r => !r.found);
        if(noneFound){
            console.log('findFromList: Ни один товар не найден, показываем Toast.');
            await AppToast.show({
                text: 'Не найдено расположение ни для одного товара из списка.',
                duration: 'long',
                position: 'bottom'
            });
        }
    }
    listInput.value = '';
};

</script>

<style scoped>
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
.suggestions-list {
  position: absolute;
  left: var(--padding-start, 16px);
  right: var(--padding-end, 16px);
  margin-top: 5px;
  z-index: 1000;
  background: var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)));
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--ion-color-step-200, #cccccc);
  border-radius: 6px;
  max-height: 250px;
  overflow-y: auto;
}
.suggestions-list ion-item {
  --padding-start: 12px;
  --padding-end: 12px;
  --min-height: 40px;
  font-size: 0.9em;
  --inner-border-width: 0 0 0.55px 0;
  --border-color: var(--ion-color-step-150, #e0e0e0);
}
.suggestions-list ion-item:last-child {
    --inner-border-width: 0;
}
:host {
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 16px;
}
ion-content.ion-padding { }
</style>