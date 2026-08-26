# 三款山水底圖 · 2026-08-26

由內建 image_gen 工具生成；未使用 CLI/API fallback。三張皆為 1536 × 1024 純 PNG，沒有音訊效果、文字或介面烘焙在圖內。

## 對應與保留

- 江天遠岫 `river-dawn.png`：替換原黑色漩渦類型（目前 #001、#004）。
- 雨竹聽泉 `bamboo-rain.png`：新作輪替。
- 丹崖秋汀 `ochre-ridge.png`：新作輪替。
- 已確認正式頁目前編號到 #005；#002、#003、#005 保留既有月色/雲山原圖。
- #006 起依江景 → 竹景 → 秋山循環，不使用字典長度決定作品配圖，避免以後新增素材導致既有作品重排。
- 舊漩渦檔案保留作回復用，但不再被任何公開圖路由引用；舊 `ink-resonance` URL 相容地改回傳江景。
- Canvas 保持獨立音訊驅動隨機墨流；新圖各自調整山水色系與可游移範圍。

## 檔案

`backend/moyun_backend/static/anonymous-art/river-dawn.png`

`backend/moyun_backend/static/anonymous-art/bamboo-rain.png`

`backend/moyun_backend/static/anonymous-art/ochre-ridge.png`

## 最終生成提示詞

### river-dawn

Use case: stylized-concept. Asset type: original pure raster landscape background for an anonymous Chinese music gallery, NOT a screenshot or UI mockup. Create ONE exquisite horizontal 3:2 Chinese shanshui painting, ideally 1536x1024. Concept 江天遠岫: a luminous open river at dawn, distant layered blue-green mountain ridges receding into pale mist, a restrained rocky bank and finely brushed pine near the lower left, distant small mountains at upper right. Composition airy, asymmetric, contemplative, the middle 55 percent is a broad quiet pale river/mist area where an independently animated ink overlay will later move. A coherent complete painting, not a decorative border around a blank box. Hand-painted Chinese ink and mineral pigment on clean warm ivory xuan paper, fine organic brush texture and subtle paper grain. Palette flower-blue indigo, muted stone blue, a little stone green, dilute ink grey, warm ivory; light overall value with nuanced mountain depth. Keep essential features within central 80 percent for 3:2 phone crops and wider desktop crops. No humans, boats, buildings, sun or moon discs. No text, calligraphy, seals, frames, logos, watermarks, gold dust, sparkles, dots, crosses, geometric shapes, black vortex, circle, portal or dark central hole. No foreground floating ink clouds or animated effects baked into the painting. Original serene river landscape, elegant and materially different from a dark circular vortex.

### bamboo-rain

Use case: stylized-concept. Asset type: original pure raster landscape background for an anonymous Chinese music gallery, NOT a screenshot or UI mockup. Create ONE exquisite horizontal 3:2 Chinese shanshui painting, ideally 1536x1024. Concept 雨竹聽泉: a fresh rain-washed bamboo grove with elegant dark jade bamboo stems and finely articulated leaves rising along the right third and a few foreground leaves at lower right, light misty foothills receding along upper left, a slender distant mountain spring barely suggested. The middle and lower left are spacious pale celadon mist and quiet water, occupying approximately 55 percent of the composition for a separately animated ink overlay. Asymmetric intimate composition, NOT symmetric mountain walls, NOT a border or blank rectangle. Refined hand-painted Chinese ink wash and mineral color on warm ivory xuan paper; tactile fine brushwork, clean subtle paper grain, no dirty texture. Palette jade/stone green, pale celadon, dilute indigo, restrained ink grey and warm ivory. Mostly light value, nuanced foliage detail near margins without filling the center. Keep composition legible at 358px-wide mobile 3:2 crop and wider desktop crop. No people, animals, buildings, moon, sun disc, words, calligraphy, seals, frames, logos, watermark, gold particles, dots, crosses, geometric shapes, circular vortex, portal, black center. No ink animation, smoke blobs, waveform or UI baked into the image. Original serene bamboo-and-mountain landscape with a distinctly different silhouette from an open river scene.

### ochre-ridge

Use case: stylized-concept. Asset type: original pure raster landscape background for an anonymous Chinese music gallery, NOT a screenshot or UI mockup. Create ONE exquisite horizontal 3:2 Chinese shanshui painting, ideally 1536x1024. Concept 丹崖秋汀: warm ochre and muted burnt-sienna layered crags enter diagonally from the lower left, sparse dark green pines and a few restrained autumn russet leaves cling to the ridge; distant pale blue-grey hills stretch across the upper right beyond an expansive mist-filled river valley. Strong asymmetry and elegant diagonal rhythm, atmospheric depth. Approximately 55 percent quiet warm cream and pale grey open valley in the middle and right, suitable for a separate audio-reactive ink overlay. Traditional hand-painted Chinese shanshui with delicate dry brush rock texture and translucent mineral pigment washes on warm ivory xuan paper. Palette soft ochre, muted terracotta, stone green accents, dilute ink and cool grey-blue distance; luminous, not brown overall, not gloomy. Keep essential features inside central 80 percent for mobile 3:2 and wider desktop crops. No figures, boats, buildings, sun/moon disc, text, calligraphy, seals, frame, watermark, logo, gold glitter, particle dots, plus signs, lines drawn as graphics, black hole, vortex, ring, portal. No separate foreground ink blobs, animation frames or UI. A complete original autumn cliff landscape, visibly distinct from a green bamboo grove and a blue dawn river.
