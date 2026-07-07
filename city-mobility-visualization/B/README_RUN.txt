芬兰科研人员城市流动网络 - 运行说明

1. 解压 B.zip。
2. 打开 PowerShell 或终端，进入解压后的文件夹：
   cd B
3. 启动本地静态服务器：
   python -m http.server 8787 --bind 127.0.0.1

   如果 python 命令不可用，可以尝试：
   py -m http.server 8787 --bind 127.0.0.1

4. 在浏览器打开：
   http://127.0.0.1:8787/

说明：
- 不建议直接双击 index.html，因为浏览器可能阻止读取 data 文件夹里的 JSON 数据。
- 本包已经包含本地 D3 文件 vendor/d3.v7.min.js，正常展示不需要联网。
- 核心页面是 index.html，图表逻辑在 src/city_mobility.js，展示数据在 data 文件夹。
- raw_data 文件夹只保留 B 部分使用的两个城市流动 Excel 文件。
- scripts/build_city_data.py 是数据生成脚本，用于从 raw_data 中的原始 Excel 重新生成 JSON；课堂展示只运行网页时不需要执行它。
