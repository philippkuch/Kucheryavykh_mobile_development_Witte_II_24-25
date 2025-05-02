import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import TabsPage from '../views/TabsPage.vue';

// Импортируем ПОЛНЫЕ версии компонентов
import OperatorPage from '../views/OperatorPage.vue';
import SearchPage from '../views/SearchPage.vue';
import MapPage from '../views/MapPage.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/tabs/search' // <<< Изменили редирект по умолчанию на Поиск
  },
  {
    path: '/tabs/',
    component: TabsPage,
    children: [
      {
        path: '',
        redirect: '/tabs/search' // <<< Изменили редирект внутри табов на Поиск
      },
      {
        path: 'search',
        name: 'Search',
        component: SearchPage // <<< Используем полную версию SearchPage
      },
      {
        path: 'map',
        name: 'Map',
        component: MapPage    // <<< Используем полную версию MapPage
      },
      {
        path: 'operator',
        name: 'Operator',
        component: OperatorPage // <<< Используем полную версию OperatorPage
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
