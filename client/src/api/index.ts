import { authApi } from './auth';
import { calendarApi } from './calendar';
import { dashboardApi } from './dashboard';
import { choresApi, mealsApi, offlineApi, shoppingApi, voiceApi } from './client';
import { projectsApi } from './projects';
import { pushApi } from './push';
import { recipesApi } from './recipes';

export {
    ApiClientError,
    initializeClientDataLayer,
    offlineApi,
    refreshOfflineDataState,
} from './client';

export const api = {
    auth: authApi,
    calendar: calendarApi,
    chores: choresApi,
    dashboard: dashboardApi,
    meals: mealsApi,
    projects: projectsApi,
    push: pushApi,
    recipes: recipesApi,
    shopping: shoppingApi,
    voice: voiceApi,
    offline: offlineApi,
};
