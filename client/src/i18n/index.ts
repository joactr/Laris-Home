export const translations: Record<string, Record<string, string>> = {
  es: {
    // Navigation
    'nav.dashboard': 'Inicio',
    'nav.shopping': 'Lista de la compra',
    'nav.calendar': 'Calendario',
    'nav.chores': 'Tareas del hogar',
    'nav.meals': 'Plan de comidas',
    'nav.recipes': 'Recetas',
    'nav.projects': 'Proyectos',
    'nav.logout': 'Cerrar sesión',

    // Generic
    'common.title': 'Título',
    'common.create': 'Crear',
    'common.add': 'Añadir',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.search': 'Buscar',
    'common.loading': 'Cargando...',
    'common.confirm': 'Confirmar',
    'common.close': 'Cerrar',
    'common.archive': 'Archivar',
    'common.back': 'Volver',
    'common.next': 'Siguiente',
    'common.prev': 'Anterior',
    'common.retry': 'Reintentar',
    'common.review': 'Revisar',
    'common.mark': 'Marcar',
    'common.unmark': 'Desmarcar',
    'common.readd': 'Volver a añadir',

    // Accessibility
    'voice.accessibility.toggle': 'Alternar asistente de voz',
    'common.accessibility.close': 'Cerrar diálogo',
    'common.accessibility.menu': 'Menú principal',

    // Auth
    'auth.login': 'Iniciar sesión',
    'auth.register': 'Registrarse',
    'auth.name': 'Nombre',
    'auth.namePlaceholder': 'Tu nombre',
    'auth.email': 'Correo electrónico',
    'auth.emailPlaceholder': 'tu@ejemplo.com',
    'auth.password': 'Contraseña',
    'auth.passwordPlaceholder': '••••••••',
    'auth.noAccount': '¿No tienes cuenta?',
    'auth.registerLink': 'Regístrate',
    'auth.hasAccount': '¿Ya tienes cuenta?',
    'auth.loginLink': 'Inicia sesión',
    'auth.createAccount': 'Crear cuenta',
    'auth.signin': 'Entrar',
    'auth.tagline': 'Tu hogar compartido, organizado',

    // Titles
    'page.dashboard': 'Inicio',
    'page.shopping': 'Lista de la compra',
    'page.calendar': 'Calendario',
    'page.chores': 'Tareas del hogar',
    'page.meals': 'Plan de comidas',
    'page.recipes': 'Recetas',
    'page.projects': 'Proyectos',
    
    // Dashboard
    'dashboard.greeting.morning': 'Buenos días',
    'dashboard.greeting.afternoon': 'Buenas tardes',
    'dashboard.greeting.evening': 'Buenas noches',
    'dashboard.todayMeals': 'Comidas de hoy',
    'dashboard.todayEvents': 'Eventos de hoy',
    'dashboard.todayChores': 'Tareas de hoy',
    'dashboard.overdueTasks': 'Tareas atrasadas',
    'dashboard.noMeals': 'No hay comidas planificadas',
    'dashboard.editMeals': 'Editar comidas →',
    'dashboard.noEvents': 'No hay eventos hoy',
    'dashboard.viewCalendar': 'Ver calendario →',
    'dashboard.noChores': 'No hay tareas de hogar hoy',
    'dashboard.manageChores': 'Gestionar tareas →',
    'dashboard.viewProjects': 'Ver proyectos →',
    'dashboard.with': 'con',

    // Shopping
    'shopping.itemsRemaining': 'artículos restantes',
    'shopping.newList': '+ Lista',
    'shopping.newListTitle': 'Nueva lista',
    'shopping.listNameLabel': 'Nombre de la lista',
    'shopping.listNamePlaceholder': 'Ej. Supermercado',
    'shopping.addItemPlaceholder': 'Añadir artículo…',
    'shopping.qtyLabel': 'Cant',
    'shopping.filterAll': 'Todos',
    'shopping.filterActive': 'Pendientes',
    'shopping.filterCompleted': 'Completados',
    'shopping.noItems': 'No hay artículos aquí',
    'shopping.addedBy': 'Añadido por',
    'shopping.deleteAllConfirm': '¿Eliminar todos los artículos completados?',
    'shopping.confirmItems': 'Confirmar items',
    'shopping.detectedItems': 'Items detectados:',
    'shopping.confirmBtn': 'Confirmar items',
    'shopping.deleteListConfirm': '¿Eliminar esta lista y todos sus ítems?',
    'shopping.deleteListOnly': 'No puedes eliminar la única lista que tienes.',
    'shopping.createListFirst': 'Crea una lista de compras primero',
    'shopping.offlinePending': 'Pendiente de sincronizar',
    'shopping.offlineError': 'Error al sincronizar',
    'shopping.voiceFallbackTitle': 'Asistente de compras',
    'shopping.voiceReviewTitle': 'Revisar artículos detectados',
    'shopping.voiceManualHint': 'Puedes reintentarlo o usar el formulario manual.',

    // Calendar
    'calendar.newEvent': '+ Evento',
    'calendar.editEvent': 'Editar evento',
    'calendar.deleteConfirm': '¿Eliminar este evento?',
    'calendar.assigned': 'Asignado a:',
    'calendar.thisWeek': 'Esta semana',
    'calendar.noEvents': 'No hay eventos esta semana',
    'calendar.category.shared': 'Compartido',
    'calendar.category.personal': 'Personal',
    'calendar.category.reminder': 'Recordatorio',
    'calendar.addEvent': 'Añadir evento',
    
    // FAB
    'fab.newPurchase': 'Nueva Compra',
    'fab.newEvent': 'Nuevo Evento',
    'fab.newTask': 'Nueva Tarea',
    
    // Chores
    'chores.addChore': '+ Tarea',
    'chores.done': 'completadas',
    'chores.noCompleted': 'Aún no hay tareas completadas',
    'chores.filterAll': 'Todas',
    'chores.filterMine': 'Mías',
    'chores.filterPartner': 'Pareja',
    'chores.newRecurring': 'Nueva tarea recurrente',
    'chores.location': 'Lugar / Habitación',
    'chores.startDate': 'Fecha de inicio',
    'chores.interval': 'Repetir cada',
    'chores.intervalDays': 'días',
    'chores.intervalWeeks': 'semanas',
    'chores.intervalMonths': 'meses',
    'chores.recurrence': 'Recurrencia',
    'chores.daily': 'Diaria',
    'chores.weekly': 'Semanal',
    'chores.monthly': 'Mensual',
    'chores.points': 'Puntos',
    'chores.assignTo': 'Asignar a',
    'chores.anyone': 'Cualquiera',
    'chores.deleteConfirm': '¿Seguro que quieres borrar esta tarea y todas las futuras (las pasadas se mantendrán)?',

    // Projects
    'projects.addProject': '+ Proyecto',
    'projects.active': 'activo',
    'projects.archive': 'Archivar',
    'projects.noActive': 'No hay proyectos activos',
    'projects.archivedTitle': 'Archivados',
    'projects.newProject': 'Nuevo proyecto',
    'projects.description': 'Descripción',
    'projects.tasks': 'Tareas',
    'projects.addTask': '+ Tarea',
    'projects.add': '+ Añadir',
    'projects.statusTodo': 'Por hacer',
    'projects.statusInProgress': 'En progreso',
    'projects.statusDone': 'Hecho',
    'projects.newTask': 'Nueva tarea',
    'projects.editTask': 'Editar tarea',
    'projects.status': 'Estado',
    'projects.priority': 'Prioridad',
    'projects.low': 'Baja',
    'projects.medium': 'Media',
    'projects.high': 'Alta',
    'projects.unassigned': 'Sin asignar',
    'projects.dueDate': 'Fecha de entrega',
    'projects.deleteConfirm': '¿Eliminar tarea?',
    'projects.archiveConfirm': '¿Archivar este proyecto?',
    'projects.deleteProjectConfirm': '¿Eliminar definitivamente este proyecto?',

    // Recipes
    'recipes.importUrl': 'Importar desde URL',
    'recipes.importBtn': 'Importar',
    'recipes.importing': 'Importando...',
    'recipes.title': 'Título',
    'recipes.description': 'Descripción',
    'recipes.prepTime': 'Prep',
    'recipes.cookTime': 'Cocción',
    'recipes.servings': 'Raciones',
    'recipes.macros': 'Macros (por ración)',
    'recipes.nutrition': 'Información nutricional',
    'recipes.calories': 'Calorías',
    'recipes.protein': 'Proteína',
    'recipes.carbs': 'Carbohidratos',
    'recipes.fat': 'Grasa',
    'recipes.ingredients': 'Ingredientes',
    'recipes.instructions': 'Instrucciones',
    'recipes.addIngredient': '+ Añadir Ingrediente',
    'recipes.addInstruction': '+ Añadir Paso',
    'recipes.reviewAndSave': 'Revisar y Guardar',
    'recipes.save': 'Guardar Receta',
    'recipes.addToShoppingList': 'Añadir al carrito',
    'recipes.noRecipes': 'No hay recetas.',
    'recipes.suggestedTitle': 'Recetas sugeridas',
    'recipes.existingMatching': 'Ver receta existente',
    'recipes.saveNewAi': 'Guardar nueva receta (IA)',
    'recipes.saveNewAiConfirm': '¿Añadir receta "{{0}}" a tus recetas? Se generarán detalles automáticamente con IA.',
    'recipes.saveNewAiSuccess': 'Receta guardada con detalles generados por IA.',
    'recipes.savingAi': 'Guardando con IA...',
    'recipes.deleteConfirm': '¿Eliminar esta receta?',
    'recipes.voiceFallbackTitle': 'Asistente de recetas',
    'recipes.voiceReviewTitle': 'Revisar sugerencias',
    'recipes.voiceRecipeChangeTitle': 'Cambios propuestos',

    // Voice
    'voice.listening': 'Escuchando...',
    'voice.processing': 'Procesando con IA...',
    'voice.thinking': 'Pensando opciones...',
    'voice.placeholder.shopping': 'Di algo como: "Añade 3 manzanas y 2 yogures"',
    'voice.placeholder.recipes': 'Di algo como: "Tengo pollo y arroz, ¿qué cocino?"',
    'voice.placeholder.recipe_detail': 'Pregunta sobre la receta o pide ajustes...',
    'voice.placeholder.generic': 'Háblame, te escucho...',
    'voice.error.noItems': 'No se detectaron items.',
    'voice.error.noRecipes': 'No se detectaron recetas.',
    'voice.transcriptLabel': 'Transcripción',

    // Meals
    'meals.breakfast': 'Desayuno',
    'meals.lunch': 'Almuerzo',
    'meals.dinner': 'Cena',
    'meals.snack': 'Merienda',
    'meals.generateWeekShopping': 'Generar compra semanal',
    'meals.generateWeekShoppingTitle': 'Generar compra desde la semana',
    'meals.generateWeekShoppingSummary': 'Se añadirán ingredientes de las comidas con receta al carrito seleccionado.',
    'meals.targetList': 'Lista destino',
    'meals.weekRecipeCount': 'Comidas con receta',
    'meals.weekSkippedTextMeals': 'Comidas de texto omitidas',
    'meals.generateWeekShoppingSuccess': 'He añadido {{0}} artículos a la lista.',
    'meals.openShopping': 'Abrir lista de compra'
  }
};

let currentLang = 'es';

export function setLanguage(lang: string) {
  currentLang = lang;
}

export function t(key: string, ...args: any[]): string {
  const langDict = translations[currentLang];
  let text = langDict?.[key] || key;
  
  if (args.length > 0) {
    args.forEach((val, idx) => {
      text = text.replace(`{{${idx}}}`, val);
    });
  }
  
  return text;
}
