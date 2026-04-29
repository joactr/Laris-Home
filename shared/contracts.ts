export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'OFFLINE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'PROCESSING_FAILED'
  | 'INTERNAL_ERROR';

export type ApiErrorPayload = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  is_admin: boolean;
  color: string;
  householdId: string | null;
};

export type HouseholdMember = AuthUser & {
  role?: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type DashboardSummary = {
  text: string;
  mode: 'ai' | 'fallback';
  status: 'ready' | 'pending';
  generated_at?: number | null;
};

export type DashboardAttentionItem = {
  id: string;
  title: string;
  hint: string;
  path: string;
  tone?: string;
};

export type DashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  path: string;
  type: string;
};

export type DashboardEventItem = {
  id: string;
  title: string;
  description?: string | null;
  start_datetime: string;
  end_datetime: string;
  category?: string | null;
  assigned_user_id?: string | null;
  assigned_name?: string | null;
  created_by_name?: string | null;
  created_by_color?: string | null;
  pending_sync?: boolean;
  sync_error?: string | null;
  local_only?: boolean;
};

export type DashboardChoreItem = {
  id: string;
  title: string;
  scheduled_date: string;
  status: string;
  location?: string | null;
  points?: number | null;
  assigned_user_id?: string | null;
  assigned_name?: string | null;
  assigned_color?: string | null;
  completed_at?: string | null;
  pending_sync?: boolean;
  sync_error?: string | null;
};

export type DashboardOverdueTaskItem = {
  id: string;
  title: string;
  project_name?: string | null;
  due_date?: string | null;
  status?: string;
  priority?: string;
};

export type DashboardPayload = {
  today: string;
  summary?: DashboardSummary;
  stats?: {
    events?: number;
    chores?: number;
    overdueTasks?: number;
    shoppingPending?: number;
  };
  attention_items?: DashboardAttentionItem[];
  activity?: DashboardActivityItem[];
  events?: DashboardEventItem[];
  meals?: Record<string, string> | null;
  chores?: DashboardChoreItem[];
  overdue_tasks?: DashboardOverdueTaskItem[];
};

export type CalendarEventCategory = 'personal' | 'shared' | 'reminder';

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  start_datetime: string;
  end_datetime: string;
  assigned_user_id?: string | null;
  category: CalendarEventCategory;
  recurrence?: string | null;
  created_by_name?: string | null;
  created_by_color?: string | null;
  pending_sync?: boolean;
  sync_error?: string | null;
  local_only?: boolean;
};

export type CalendarEventInput = {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  assigned_user_id?: string | null;
  category: CalendarEventCategory;
};

export type ProjectStatus = 'active' | 'archived';
export type ProjectTaskStatus = 'todo' | 'inProgress' | 'done';
export type ProjectTaskPriority = 'low' | 'medium' | 'high';

export type ProjectSummary = {
  id: string;
  household_id?: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  created_at?: string;
  updated_at?: string;
};

export type ProjectInput = {
  name: string;
  description?: string;
  status?: ProjectStatus;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  assigned_user_id?: string | null;
  assigned_name?: string | null;
  assigned_color?: string | null;
  created_by_user_id?: string;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectTaskInput = {
  title: string;
  description?: string;
  status?: ProjectTaskStatus;
  priority?: ProjectTaskPriority;
  assigned_user_id?: string | null;
  due_date?: string | null;
};

export type ShoppingList = {
  id: string;
  household_id?: string;
  name: string;
  is_default?: boolean;
};

export type RecipeIngredient = {
  id?: string;
  name: string;
  originalText: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

export type RecipeRecordIngredient = {
  id: string;
  recipe_id?: string;
  name: string;
  original_text: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

export type RecipeRecord = {
  id: string;
  source_url?: string | null;
  image_url?: string | null;
  title: string;
  description: string;
  instructions: string;
  servings?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  calories_per_serving?: number | null;
  protein_per_serving?: number | null;
  carbs_per_serving?: number | null;
  fat_per_serving?: number | null;
  ingredients?: RecipeRecordIngredient[];
  tags?: Array<{ id: string; name: string }>;
  is_favorite?: boolean;
  my_rating?: number | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  caloriesPerServing?: number | null;
  proteinPerServing?: number | null;
  carbsPerServing?: number | null;
  fatPerServing?: number | null;
};

export type ShoppingDuplicatePreview = {
  item: {
    name: string;
    normalized_name: string;
    quantity?: number | null;
    unit?: string | null;
    category?: string | null;
    notes?: string | null;
  };
  candidates: Array<{
    id: string;
    name: string;
    quantity?: number | null;
    unit?: string | null;
    category?: string | null;
  }>;
};

export type BuyAgainSuggestion = {
  normalized_name: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  times_bought: number;
  last_bought_at?: string | null;
};

export type RecipeDraft = {
  title: string;
  description: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  caloriesPerServing?: number | null;
  proteinPerServing?: number | null;
  carbsPerServing?: number | null;
  fatPerServing?: number | null;
  ingredients: RecipeIngredient[];
  instructions: string[];
};

export type ImportedRecipe = RecipeDraft;

export type RecipePayload = {
  id?: string;
  source_url?: string | null;
  image_url?: string | null;
  title: string;
  description: string;
  instructions: string | string[];
  servings?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  calories_per_serving?: number | null;
  protein_per_serving?: number | null;
  carbs_per_serving?: number | null;
  fat_per_serving?: number | null;
  ingredients: RecipeIngredient[];
};

export type VoiceEnvelopeStatus = 'success' | 'needs_review' | 'fallback';

export type VoiceEnvelope<T extends Record<string, unknown>> = {
  status: VoiceEnvelopeStatus;
  message: string;
  code?: ApiErrorCode | string;
  retryable?: boolean;
  transcript?: string;
} & T;

export type VoiceShoppingItem = {
  name: string;
  quantity: number;
};

export type VoiceRecipeSuggestion = {
  id?: string;
  name: string;
  ingredients: string[];
  instructions: string;
  time: string;
  image: string;
};

export type VoiceRecipeCommandProposal = {
  title: string;
  description: string;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  caloriesPerServing?: number | null;
  proteinPerServing?: number | null;
  carbsPerServing?: number | null;
  fatPerServing?: number | null;
  ingredients: RecipeIngredient[];
  instructions: string[];
};

export type VoiceTranscriptionResponse = {
  transcript: string;
  durationMs?: number;
};
