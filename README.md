<div align="center">
  <img src="https://ccc.byron.wang/api/readme.svg" alt="CCC Attendance — 一个签到码，三步搞定；二维码生成趋势与历史累计生成总量" width="100%" />
  <br />
  <a href="https://ccc.byron.wang"><img src="https://img.shields.io/website?url=https%3A%2F%2Fccc.byron.wang&label=site&style=flat-square&labelColor=504E49&color=1B365D" alt="Website"></a>
  <a href="https://github.com/byronwang2005/CCC-Attendance/stargazers"><img src="https://img.shields.io/github/stars/byronwang2005/CCC-Attendance?style=flat-square&label=stars&labelColor=504E49&color=1B365D" alt="Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1B365D?style=flat-square&labelColor=504E49" alt="License"></a>
</div>


## 严正声明

- 本仓库是一个开源娱乐项目，严禁用于CCC代签
- 仓库所有者保留对非法使用本程序者追责的权利
- 欢迎在Issues留言：若项目有侵权，仓库所有者会立即处理

## 使用方法

访问[https://ccc.byron.wang/](https://ccc.byron.wang/)

## 贡献代码

参考[CONTRIBUTING](CONTRIBUTING.md)

## 四季树景与本地预览

运行 `npm install` 和 `npm run dev`，打开终端显示的本地地址并加上 `?preview=seasons&season=autumn`。页面可切换春、夏、秋、冬，点击树景可聚合为二维码，再次点击恢复；季节参数支持 `spring`、`summer`、`autumn`、`winter`。

预览使用本地演示二维码，编码内容为 `https://example.com/season-preview`，无需签到接口。色卡中的 HEX 为屏幕设计色，参考 Pantone TCX 的色彩气质。入口和演示素材仅在开发环境加载；正式页面按北京时间每年固定日期自动换季：3 月 5 日春季、5 月 5 日夏季、10 月 8 日秋季、12 月 7 日冬季，均于当天 00:00 生效。冬景延续至次年 3 月 5 日；这些日期不随每年节气的天文时刻变化。树景、二维码配色和诗句同步切换，页面跨日或从后台恢复时会自动更新。

代码入口为 `MagicTreeStage` 的可选 `season` 参数；显式传入季节即可使用完整季节设计，正式二维码页通过 `useTreeSeason` 传入当季，开发预览可手动覆盖；底层组件省略参数仍保留原秋景。四季沿用同一套两秒聚合动画。

## 开源协议

本项目采用MIT协议开源，详见[LICENSE](LICENSE)
