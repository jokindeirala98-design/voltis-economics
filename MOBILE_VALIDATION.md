# Mobile Upload Validation Checklist

## Implementation Summary

### 1. Camera Support - EXPLICIT ✅

**New component:** `MobileUploadButton.tsx`

**Mobile users now see a bottom sheet with 3 explicit options:**
- **Hacer foto** (Camera icon, blue) → Opens camera directly
- **Galería** (Image icon, green) → Opens photo library
- **Archivos** (File icon, purple) → Opens file browser

**Implementation:**
```html
<!-- Camera: Opens rear camera for document capture -->
<input type="file" accept="image/*" capture="environment" />

<!-- Gallery: Opens photo library -->
<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple />

<!-- Files: Opens document picker -->
<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx" multiple />
```

---

## 2. HEIC/HEIF Support

### Support Status: PARTIAL ⚠️

| Device/Browser | HEIC Support | Notes |
|----------------|--------------|-------|
| iPhone Safari (iOS 16+) | ✅ Native | Safari handles HEIC natively |
| iPhone Safari (iOS 14-15) | ❌ Fallback | Shows warning message |
| Chrome Android | ❌ Fallback | Usually converts to JPEG |
| Samsung Internet | ❌ Fallback | Usually converts to JPEG |

### Implementation:
1. HEIC files are accepted by the input
2. Client-side check attempts to load image
3. If load fails → Shows amber warning: "HEIC no soportado. Convierte a JPG o PNG."
4. File is not added to queue

### Recommendation for Users:
- **iPhone**: Photos taken with camera save as HEIC. Use "Hacer foto" which captures as JPEG, or convert settings to save as JPEG.
- **Android**: Usually saves as JPEG/PNG automatically.

---

## 3. Validation Checklist

### iPhone Safari

| Test Case | Expected | Status |
|-----------|----------|--------|
| PDF from Files app | Opens Files, user selects PDF, upload starts | ⬜ Test |
| Image from Gallery | Opens Photos, user selects image, upload starts | ⬜ Test |
| Photo with Camera | Opens camera, user takes photo, upload starts | ⬜ Test |
| HEIC photo from Gallery | Warning shown: "HEIC no soportado" | ⬜ Test |
| Multiple files selected | All files processed | ⬜ Test |

### Android Chrome

| Test Case | Expected | Status |
|-----------|----------|--------|
| PDF from Downloads | Opens file picker, user selects PDF | ⬜ Test |
| Image from Gallery | Opens photo picker, user selects image | ⬜ Test |
| Photo with Camera | Opens camera, user takes photo | ⬜ Test |
| WEBP image | Upload works correctly | ⬜ Test |
| Multiple files selected | All files processed | ⬜ Test |

### Desktop (Regression)

| Test Case | Expected | Status |
|-----------|----------|--------|
| Drag & drop PDF | Upload starts | ⬜ Verify |
| Click dropzone, select PDF | Upload starts | ⬜ Verify |
| Drag & drop image | Upload starts | ⬜ Verify |
| Excel upload | Still works | ⬜ Verify |

---

## 4. UX Improvements

### Before (Desktop-only design)
```
┌─────────────────────────────┐
│      [Upload Icon]         │
│    Cargar Facturas         │
│  PDF o Excel • Arrastra    │
└─────────────────────────────┘
```

### After (Mobile-first design)
```
┌─────────────────────────────┐
│  [Camera Icon] Subir factura│
│  (Tappable button, 44px+)   │
└─────────────────────────────┘
         ↓ tap
┌─────────────────────────────┐
│      Seleccionar factura     │
│                             │
│  [Camera] [Gallery] [Files] │
│  Hacer    Galería  Archivos  │
│  foto                           │
│                             │
│  PDF, JPG, PNG, WEBP, HEIC   │
└─────────────────────────────┘
```

### Mobile UX Features:
- ✅ Full-width tappable button
- ✅ Large touch targets (min 44x44px)
- ✅ Bottom sheet modal (native feel)
- ✅ Clear iconography
- ✅ Supported formats listed
- ✅ Cancel option
- ✅ Warning toasts for HEIC issues

---

## 5. Files Modified

| File | Change |
|------|--------|
| `src/components/MobileUploadButton.tsx` | **NEW** - Mobile upload UI |
| `src/app/page.tsx` | Mobile button + dropzone visibility control |
| `src/app/api/extract/route.ts` | HEIC detection + image handling |
| `src/app/api/extract/route.ts` | Vision-based extraction for images |
| `src/lib/classifier.ts` | Vision classification support |

---

## 6. Testing Instructions

### Manual Test Steps:

1. **Open app on mobile device**
2. **Navigate to a project**
3. **Tap "Subir factura" button**
4. **Test each option:**
   - Tap "Hacer foto" → Camera opens → Take photo → Check upload
   - Tap "Galería" → Photo picker opens → Select image → Check upload
   - Tap "Archivos" → File picker opens → Select PDF/image → Check upload

5. **Test extraction:**
   - After upload completes, check report shows the invoice
   - Verify data was extracted correctly

6. **Test HEIC (iPhone only):**
   - Try to upload a HEIC photo from gallery
   - Expect warning toast: "HEIC no soportado. Convierte a JPG o PNG."
   - Photo should NOT be added to queue

---

## 7. Known Limitations

| Issue | Workaround |
|-------|------------|
| HEIC on older iOS | User converts to JPEG first |
| HEIC on Android Chrome | Usually auto-converts, but verify |
| Camera flash on documents | User should ensure good lighting |
| Large image files | Compression happens automatically |

---

## 8. Browser Compatibility

| Feature | iOS Safari | Chrome Android | Safari Desktop | Chrome Desktop |
|---------|------------|----------------|---------------|---------------|
| Camera capture | ✅ | ✅ | N/A | N/A |
| Photo library | ✅ | ✅ | N/A | N/A |
| File picker | ✅ | ✅ | ✅ | ✅ |
| Drag & drop | N/A | N/A | ✅ | ✅ |
| HEIC native | ✅ (16+) | ❌ | ✅ (16+) | ❌ |
| WEBP | ✅ | ✅ | ✅ | ✅ |
