# Tracking Stage Title Rendering Fix - Documentation

## Bug Report
**Issue:** The customer tracking page was displaying raw i18n translation keys like `track_stage.dinein.ready` instead of proper customer-facing text, creating an unprofessional, broken appearance.

## Root Cause Analysis

### Missing Translation Keys
The tracking page was attempting to look up `track_stage.dinein.ready` in the translation dictionary, but this key was **missing** from both English and Lithuanian translations.

**Stage definitions** (`/app/app/order/[id]/page.js`):
```javascript
const STAGES_DINEIN = [
  { key: 'received', icon: Clock },
  { key: 'in_kitchen', icon: Soup },
  { key: 'ready', icon: Utensils },  // ← This key was missing!
]
```

**Translations** (`/app/lib/i18n.js` - BEFORE):
```javascript
track_stage: {
  dinein: {
    received: 'Order received',
    in_kitchen: 'In the kitchen',
    // 'ready' was MISSING ❌
    plated: 'Food ready',
    served: 'Served to your table',
  }
}
```

**Translation lookup:**
```javascript
const label = t(`track_stage.dinein.ready`)
// Returns: "track_stage.dinein.ready" (fallback to raw key)
```

### Fallback Behavior
The `t()` function in AppContext returns the **original path string** when a translation is not found:
```javascript
const t = (path) => {
  const parts = path.split('.')
  let obj = TRANSLATIONS[lang] || TRANSLATIONS.en
  for (const p of parts) { obj = obj?.[p] }
  return obj || path  // ← Returns raw key if not found
}
```

This is why customers saw `track_stage.dinein.ready` instead of proper text.

## Solution Implemented

### 1. Added Missing Translation Keys

**English (`/app/lib/i18n.js`):**
```javascript
track_stage: {
  dinein: {
    received: 'Order received',
    in_kitchen: 'In the kitchen',
    ready: 'Food ready — on the way to your table',  // ← ADDED
    plated: 'Food ready',
    served: 'Served to your table',
  }
}
```

**Lithuanian (`/app/lib/i18n.js`):**
```javascript
track_stage: {
  dinein: {
    received: 'Užsakymas gautas',
    in_kitchen: 'Virtuvėje',
    ready: 'Patiekalas paruoštas — keliauja prie jūsų staliuko',  // ← ADDED
    plated: 'Patiekalas paruoštas',
    served: 'Patiekta prie jūsų staliuko',
  }
}
```

### 2. Removed Hardcoded Override

**Before:**
```javascript
const label = (kind === 'dinein' && s.key === 'ready')
  ? 'Food ready — on the way to your table'  // Hardcoded English
  : t(`track_stage.${kind}.${s.key}`)
```

**After:**
```javascript
const label = t(`track_stage.${kind}.${s.key}`)  // Always use i18n
```

This ensures:
- Lithuanian translations work correctly
- Consistent i18n approach across all stages
- No hardcoded English strings

## Files Modified
1. ✅ `/app/lib/i18n.js` - Added `ready` translation for both EN and LT
2. ✅ `/app/app/order/[id]/page.js` - Removed hardcoded override

## Testing Results

### Visual Verification
**Before Fix:**
```
Timeline showing:
  🟢 Order received
  ⚪ In the kitchen
  ⚪ track_stage.dinein.ready  ← RAW KEY VISIBLE ❌
```

**After Fix:**
```
Timeline showing:
  🟢 Order received
  ⚪ In the kitchen
  ⚪ Food ready — on the way to your table  ← PROPER TEXT ✅
```

### Language Switching
**English:**
- ✅ "Order received"
- ✅ "In the kitchen"
- ✅ "Food ready — on the way to your table"

**Lithuanian:**
- ✅ "Užsakymas gautas"
- ✅ "Virtuvėje"
- ✅ "Patiekalas paruoštas — keliauja prie jūsų staliuko"

### All Order Types Verified
**Dine-in:**
- ✅ All stages render properly
- ✅ No raw keys visible

**Delivery:**
- ✅ Checked: received, preparing, courier_requested, ready, picked_up, delivered
- ✅ All translations present

**Pickup:**
- ✅ Checked: received, preparing, ready, delivered
- ✅ All translations present

## Complete Translation Audit

### Dine-in Stages
| Stage Key | English | Lithuanian | Status |
|-----------|---------|------------|--------|
| `received` | Order received | Užsakymas gautas | ✅ |
| `confirmed` | Confirmed by kitchen | Virtuvė patvirtino | ✅ |
| `in_kitchen` | In the kitchen | Virtuvėje | ✅ |
| `ready` | Food ready — on the way... | Patiekalas paruoštas — keliauja... | ✅ |
| `plated` | Food ready | Patiekalas paruoštas | ✅ |
| `served` | Served to your table | Patiekta prie jūsų staliuko | ✅ |

### Delivery Stages
| Stage Key | English | Lithuanian | Status |
|-----------|---------|------------|--------|
| `received` | Order received | Užsakymas gautas | ✅ |
| `preparing` | Preparing | Ruošiama | ✅ |
| `courier_requested` | Courier requested | Iškviestas kurjeris | ✅ |
| `ready` | Ready | Paruošta | ✅ |
| `picked_up` | Picked up | Paimta | ✅ |
| `delivered` | Delivered | Pristatyta | ✅ |

### Pickup Stages
| Stage Key | English | Lithuanian | Status |
|-----------|---------|------------|--------|
| `received` | Order received | Užsakymas gautas | ✅ |
| `preparing` | Preparing | Ruošiama | ✅ |
| `ready` | Ready for pickup | Paruošta atsiimti | ✅ |
| `delivered` | Picked up | Atsiimta | ✅ |

## Customer Experience Impact

### Before Fix
- 😕 Saw developer keys: "track_stage.dinein.ready"
- 😕 Looked broken and unprofessional
- 😕 Confusion: "What does this mean?"
- 😕 Lost trust in the digital experience

### After Fix
- 😊 Clear, natural language: "Food ready — on the way to your table"
- 😊 Premium, polished appearance
- 😊 Restaurant-quality experience
- 😊 Builds confidence in the system

## Prevention Guidelines

### For Developers
1. **Always add both EN and LT translations** for new stages
2. **Test language switching** after adding translation keys
3. **Avoid hardcoded strings** - always use `t()` function
4. **Verify fallback behavior** - check if missing keys show raw text

### Translation Key Naming Convention
```
track_stage.{order_type}.{stage_key}
track_stage.{order_type}.{stage_key}_hint

Examples:
  track_stage.dinein.ready
  track_stage.dinein.ready_hint
  track_stage.delivery.picked_up
  track_stage.delivery.picked_up_hint
```

### Adding New Stages
```javascript
// 1. Define stage in component
const STAGES_NEW_TYPE = [
  { key: 'new_stage', icon: SomeIcon }
]

// 2. Add translations in i18n.js (both languages!)
track_stage: {
  new_type: {
    new_stage: 'English Label',
    new_stage_hint: 'English hint text',
  }
}

// 3. Test both languages before committing
```

## Safe Fallback Strategy

### Current Fallback
If translation missing → Returns raw key string (bad UX)

### Recommended Improvement (Future)
```javascript
const t = (path, fallback = null) => {
  const parts = path.split('.')
  let obj = TRANSLATIONS[lang] || TRANSLATIONS.en
  for (const p of parts) { obj = obj?.[p] }
  
  // If not found, try fallback or return readable error
  if (!obj) {
    if (fallback) return fallback
    console.warn(`Missing translation: ${path}`)
    return fallback || 'Translation missing'
  }
  return obj
}

// Usage with safe fallback:
const label = t(`track_stage.${kind}.${s.key}`, 'Status update')
```

This prevents raw keys from showing to customers.

## Edge Cases Handled

### Case 1: Stage Key Mismatch
**Problem:** Code uses `ready`, translations have `plated`
**Solution:** Added both `ready` and `plated` translations

### Case 2: Lithuanian-only Users
**Problem:** Hardcoded English override broke LT experience
**Solution:** Removed hardcode, use i18n for all languages

### Case 3: Future Stage Additions
**Problem:** New stages might be added without translations
**Solution:** This fix serves as template + documentation

## Conclusion

The tracking stage title rendering bug was caused by a missing translation key (`track_stage.dinein.ready`) combined with a fallback mechanism that exposed raw developer keys to customers. 

**Fixes applied:**
1. ✅ Added missing `ready` translation (EN + LT)
2. ✅ Removed hardcoded English override
3. ✅ Verified all stage translations present
4. ✅ Tested language switching

**Result:** Premium, polished tracking experience with proper customer-facing text in both English and Lithuanian.

**Status:** ✅ Production Ready
**Impact:** ✅ Critical UX bug resolved
**Testing:** ✅ Visual + functional verification complete
**Languages:** ✅ EN + LT working correctly
