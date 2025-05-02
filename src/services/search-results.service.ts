// src/services/search-results.service.ts
import { ref, readonly } from 'vue';

// Описываем, как выглядит элемент результата поиска
export interface SearchResultItem {
    productName: string;    // Имя товара (как его ввел пользователь или нашел поиск)
    sectionNames: string[]; // Найденные секции для этого товара
    found: boolean;         // Флаг, был ли товар вообще найден в каталоге
}

// Реактивное хранилище для результатов
const searchResults = ref<SearchResultItem[]>([]);

// Экспортируем composable функцию для работы с результатами
export function useSearchResults() {

    // Функция для установки новых результатов
    const setResults = (results: SearchResultItem[]) => {
        searchResults.value = results;
        console.log("SearchService: Вызван setResults с данными:", JSON.parse(JSON.stringify(results)));
        console.log("SearchService: Результаты поиска установлены:", JSON.parse(JSON.stringify(results)));
    };

    // Функция для очистки результатов
    const clearResults = () => {
        searchResults.value = [];
         console.log("SearchService: Результаты поиска очищены.");
    };

    // Предоставляем реактивную ссылку только для чтения вовне
    const currentResults = readonly(searchResults);

    // Возвращаем ссылку и функции для управления
    return {
        currentResults,
        setResults,
        clearResults,
    };
}