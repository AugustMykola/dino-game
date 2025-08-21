import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';

import { environment } from '../environments/environment';

// AngularFire
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideAnalytics, getAnalytics } from '@angular/fire/analytics';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),

    // Firebase core
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),

    // Services (підключай лише ті, що реально потрібні)
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),

    // Analytics — тільки у браузері і якщо в конфігу є measurementId
    ...(typeof window !== 'undefined' && environment.firebaseConfig.measurementId
      ? [provideAnalytics(() => getAnalytics())]
      : [])
  ]
};
