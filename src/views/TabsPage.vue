<template>
   <ion-page>
     <ion-tabs>
       <ion-router-outlet></ion-router-outlet>
       <ion-tab-bar slot="bottom">
         <ion-tab-button tab="search" href="/tabs/search">
           <ion-icon aria-hidden="true" :icon="searchOutline" />
           <ion-label>Поиск</ion-label>
         </ion-tab-button>

         <ion-tab-button tab="map" href="/tabs/map">
           <ion-icon aria-hidden="true" :icon="mapOutline" />
           <ion-label>Карта</ion-label>
         </ion-tab-button>

         <ion-tab-button tab="operator" href="/tabs/operator">
           <ion-icon aria-hidden="true" :icon="buildOutline" />
           <ion-label>Оператор</ion-label>
         </ion-tab-button>
       </ion-tab-bar>
     </ion-tabs>
   </ion-page>
 </template>

 <script setup lang="ts">
 import { IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet } from '@ionic/vue';
 import { searchOutline, mapOutline, buildOutline } from 'ionicons/icons';
 </script>
 