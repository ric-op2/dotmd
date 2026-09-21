# 使用ソフトウェア

ゲーム本体 (dot)md v0.62 の利用条件は [GAME.txt](licenses/GAME.txt) をご覧ください。

## FCEUmm

ブラウザ内で実行するエミュレーター。romdev-core-fceumm 0.13.0 のWebAssemblyを使用しています。ライセンスはGPL-2.0-or-laterです。

- [ライセンス全文](licenses/FCEUMM-GPL.txt)
- [FCEUmmの対応ソース](source/fceumm-source.tar.gz) — libretro/libretro-fceumm, commit 3a84a6fd0ba20dd4877c06b1d58741172148395f
- [ビルド手順・パッチを含むromdevソース](source/romdev-fceumm-0.13.0-source.tar.gz) — commit 56916047b15da3e8cf3b6b6950607990b8f909b8（対応するビルド手順・スクリプト類を抜粋）
- [ブラウザ対応で変更した箇所](source/browser-glue-change.txt)

romdevソースの packages/romdevtools/BUILDING.md と packages/romdevtools/scripts/build-fceumm.sh にビルド手順があります。WebAssembly本体は変更していません。

## romdev-core-host

Luis MontesによるMITライセンスの実行基盤（0.13.0）。JavaScriptソースを vendor/host/ に同梱しています。[ライセンス全文](licenses/ROMDEV-MIT.txt)。

## DOTMD専用の起動・ディスク処理

この試作は任天堂のディスクシステムBIOSを含みません。ゲーム固有の起動・読込み・保存を、独自の6502ブリッジとJavaScriptで処理します。汎用のFDS BIOSではありません。

- [ブリッジのソース](source/bridge.s)
- [メモリー配置](source/bridge.cfg)
- JavaScript側：bridge.mjs

ブラウザ版のタイミング調整は、v0.62本体の判定時計を使用します。設定はブラウザの調整画面から行い、読込み時のパッチで本体側の設定画面への操作を抑止します。配布用FDSファイル自体は変更していません。

本作は任天堂の公式製品ではありません。
