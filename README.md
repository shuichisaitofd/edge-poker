# 旅館カブ (edge-poker)

旅館の畳の上で『カブ』を遊ぶスマホ向けカードゲーム。静的サイト(HTML/CSS/JS)。
公開: https://shuichisaitofd.github.io/edge-poker/

## 構成
- `index.html` / `css/style.css` — 畳フィールドの縦画面UI(札・硬貨・点数は全て独立DOM)
- `js/rules.js` — ルール判定(純粋関数)。暫定ルールは `CONFIG` で切替
- `js/game.js` — 状態遷移・配札・入力 / `js/cards.js` 札・硬貨の描画 / `js/audio.js` 合成効果音 / `js/fx.js` 演出
- `assets/` — 手続き生成の背景素材(`tools/gen_assets.py` で再生成)。写真素材へは同名で差し替え可
- `docs/RULES.md` — ルール仕様(確定/暫定の区別)

## テスト
```
python3 -m http.server 8765 &
node --test tests/rules.test.js      # 役判定・配当の単体テスト
python3 tests/e2e.py                 # 実画面E2E(320/375/390/430/PC 他、重なり検出含む)
python3 tests/visual.py              # スクリーンショット比較 (--update で基準更新)
```
`?seed=N` で配札を固定、`?speed=0.3` で演出を速くできる(テスト用)。
