# Quick Reference: Map Accuracy Features

## For Developers

### Using Enhanced Geocoding in Your Components

```typescript
import { 
  resolveLocationFromCoordinates, 
  searchLocation,
  type ResolvedLocation 
} from '@/lib/geocoding';

// Reverse geocoding (coordinates → address)
const location = await resolveLocationFromCoordinates(lat, lng);
console.log(location.formattedAddress); // No Plus Codes!
console.log(location.streetAddress);    // Street-level detail
console.log(location.displayName);      // Best available name

// Forward search (query → location)
const result = await searchLocation('Quezon Avenue, Mabini', {
  context: {
    municipality: 'Mabini',
    barangayName: 'Pindasan',
  },
  locationBias: { lat: 7.843, lng: 125.621 }
});
```

### MapLocationPicker Props

```typescript
<MapLocationPicker
  onLocationChange={(address, coords) => {
    console.log(address); // Clean address without Plus Codes
    console.log(coords);  // { lat, lng }
  }}
  defaultCenter={{ lat: 7.0736, lng: 125.6128 }}
  defaultAddress="Initial address"
  municipality="Mabini"        // Optional: Improves search accuracy
  barangayName="Pindasan"      // Optional: Improves search accuracy
/>
```

### Address Quality Detection

```typescript
function getAddressQuality(resolved: ResolvedLocation): 'street' | 'neighborhood' | 'city' {
  if (resolved.streetAddress && 
      resolved.streetAddress !== resolved.barangayName && 
      resolved.streetAddress !== resolved.municipality) {
    return 'street';        // Best: Has specific street address
  }
  
  if (resolved.purokSitio || resolved.barangayName) {
    return 'neighborhood';  // Good: Has neighborhood info
  }
  
  return 'city';           // Okay: Only city-level
}
```

## For Users

### Distribution Event Location Selection

**Three Ways to Set Location:**

1. **🔍 Search Address**
   - Type street name, landmark, or place
   - System finds street-level results when available
   - Pin drops automatically on map

2. **📍 Click on Map**
   - Click anywhere on map to drop pin
   - System finds nearest street address
   - Address appears below map

3. **📡 Use My Location**
   - Click crosshair button
   - Uses device GPS
   - Finds accurate street address

### Address Quality Badges

- 🟢 **Street-level** - Most accurate (has specific street address)
- 🔵 **Neighborhood-level** - Good (has barangay or purok)
- 🟡 **City-level** - Approximate (only municipality info)

### What Changed?

**Before:**
- Addresses showed codes like "8V52+H3V, Mabini"
- Hard to read and understand
- Less accurate search results

**After:**
- Shows real addresses like "Quezon Avenue, Mabini, Davao de Oro"
- Human-readable location names
- Better search accuracy
- Quality indicators

## Testing Checklist

- [ ] Create distribution event with search
- [ ] Create distribution event with map click
- [ ] Create distribution event with geolocation
- [ ] Verify no Plus Codes appear in any address
- [ ] Check quality badges display correctly
- [ ] Verify pin placement matches address
- [ ] Test on mobile device
- [ ] Test with poor network (slow geocoding)

## Troubleshooting

### Issue: Getting Plus Codes in Address

**Solution:** This should no longer happen. If it does:
1. Check that `stripPlusCode()` is being called
2. Verify scoring penalty is -500
3. Ensure street-level filtering is active

### Issue: Inaccurate Pin Placement

**Solution:**
1. Click map again to refine
2. Use search instead of click-to-pin
3. Zoom in before clicking map
4. Check quality badge - may need manual verification

### Issue: Search Returns No Results

**Solution:**
1. Try broader search term (e.g., "Mabini" instead of full address)
2. Check internet connection
3. Verify Google Maps API key is valid
4. Try click-to-pin instead

## API Changes

### Breaking Changes
None - all changes are backward compatible

### New Features
- Multi-strategy search fallback
- Address quality indicators
- Plus Code filtering in all geocoding operations
- Context-aware search with municipality/barangay

### Deprecated
None

## Performance Notes

- Geocoding may take 1-3 seconds depending on connection
- Multi-strategy search adds ~500ms latency in fallback cases
- Nearby search refinement adds ~300ms for vague locations
- Results are not cached (offline mode shows coordinates only)

## File Locations

```
/root/pwa/
├── lib/
│   └── geocoding.ts                    # Core utilities
├── components/
│   └── MapLocationPicker.tsx           # Map picker component
├── app/
│   └── distribution/
│       └── new/page.tsx                # Uses MapLocationPicker
├── tests/
│   └── geocoding-unit.test.js          # Unit tests
├── test-geocoding.html                 # Browser tests
└── IMPLEMENTATION_SUMMARY.md           # Full details
```
