<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
         <ion-buttons slot="start">
             <ion-back-button default-href="/tabs/search"></ion-back-button>
         </ion-buttons>
        <ion-title>Карта (Этап 1)</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true" class="ion-padding">
      <p>Страница Карты появится на следующих этапах.</p>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton } from '@ionic/vue';
// Минимум логики для заглушки
</script>

<style scoped>
/* Минимум стилей */
</style>
