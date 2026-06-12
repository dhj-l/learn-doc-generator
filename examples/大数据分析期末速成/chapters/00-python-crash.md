# 第0章 Python 基础速通

> ⏱ 预计学习时间：1-2 小时 | 🎯 目标：能看懂并写出后续章节的 Python 代码

## 🎯 本章目标

学习完本章，你将能够：
- 熟练使用 Python 基本数据类型和容器（列表/字典/元组）
- 编写条件判断和循环语句
- 定义函数和使用 lambda 表达式
- 用列表推导式简化代码
- 读写文本文件和 CSV 文件

---

## 0.1 变量与基本数据类型

Python 是**动态类型**语言——变量不需要声明类型，直接赋值即可。

```python
# ─── 数值类型 ───
age = 20               # int 整数
price = 89.5           # float 浮点数
score = 70 + 0.5       # 运算结果 70.5

# ─── 字符串 ───
name = "张三"
course = '大数据分析'   # 单引号双引号都可以
print(name + " 学习 " + course)   # 字符串拼接

# ─── 布尔类型 ───
is_pass = True         # 注意大写 T/F
is_fail = False

# ─── 查看类型 ───
print(type(age))       # <class 'int'>
print(type(price))     # <class 'float'>
print(type(name))      # <class 'str'>
```

> **💡 考试重点**：`type()` 函数用来判断变量类型，选择题常考

## 0.2 字符串操作

```python
text = "  Hello, 大数据分析!  "
print(len(text))          # 长度：22（含空格）
print(text.strip())       # 去掉首尾空格 → "Hello, 大数据分析!"
print(text.lower())       # 转小写
print(text.upper())       # 转大写
print(text.replace("大数据", "数据"))  # 替换
print(text.split(","))    # 按逗号分割 → ['  Hello', ' 大数据分析!  ']
print("大数据" in text)   # 判断子串 → True
```

## 0.3 列表（List）—— 最常用的容器

列表用 `[]` 表示，**有序、可修改**，可以装不同类型的数据。

```python
# ─── 创建列表 ───
scores = [85, 92, 78, 90, 88]
mixed = [1, "hello", 3.14, True]
empty = []

# ─── 索引访问（从0开始） ───
print(scores[0])     # 第一个元素：85
print(scores[-1])    # 最后一个元素：88
print(scores[1:3])   # 切片 [1,3) → [92, 78]

# ─── 常用操作 ───
scores.append(95)         # 追加元素
scores.insert(0, 80)      # 在索引0插入
scores.remove(78)         # 删除第一个78
popped = scores.pop()     # 弹出最后一个
print(len(scores))        # 长度
print(sum(scores))        # 求和
print(max(scores))        # 最大值
print(min(scores))        # 最小值
print(sorted(scores))     # 排序（不修改原列表）

# ─── 列表遍历 ───
for s in scores:
    print(s, end=" ")     # 逐个打印

# 带索引遍历
for i, s in enumerate(scores):
    print(f"索引{i}: {s}")
```

> **💡 考试重点**：索引从0开始、切片 `[start:end]` 含头不含尾、`append/pop` 方法

## 0.4 元组（Tuple）—— 不可变的列表

元组用 `()` 表示，**创建后不能修改**。

```python
point = (3, 5)
print(point[0])      # 3
# point[0] = 10      # ❌ 报错！元组不可修改

# 元组解包
x, y = point
print(f"x={x}, y={y}")

# 函数返回多个值本质就是返回元组
def get_min_max(lst):
    return min(lst), max(lst)

result = get_min_max([3, 1, 4, 1, 5])
print(result)        # (1, 5)
```

## 0.5 字典（Dict）—— 键值对

字典用 `{}` 表示，通过 `键(key)` 访问 `值(value)`。

```python
# ─── 创建字典 ───
student = {
    "name": "张三",
    "age": 20,
    "score": 85
}

# ─── 访问 ───
print(student["name"])       # 张三
print(student.get("age"))    # 20（推荐，不存在返回None不报错）
print(student.get("grade", "无"))  # 不存在返回默认值

# ─── 修改与添加 ───
student["score"] = 90        # 修改
student["grade"] = "优秀"     # 添加新键

# ─── 遍历 ───
for key, value in student.items():
    print(f"{key}: {value}")

# 只遍历键
for k in student.keys():
    print(k)

# 只遍历值
for v in student.values():
    print(v)

# ─── 判断键是否存在 ───
print("name" in student)     # True
```

> **💡 考试重点**：`dict[key]` 与 `dict.get(key)` 的区别（前者不存在会报错）

## 0.6 条件语句

```python
score = 75

if score >= 90:
    grade = "优秀"
elif score >= 70:
    grade = "良好"       # ← 会走到这里
elif score >= 60:
    grade = "及格"
else:
    grade = "不及格"

print(f"成绩等级：{grade}")

# ─── 复合条件 ───
age = 20
if age >= 18 and age <= 60:   # 且
    print("成年劳动力")
if age < 18 or age > 60:      # 或
    print("非劳动力")
if not age < 18:              # 非
    print("已成年")
```

## 0.7 循环

### for 循环

```python
# ─── 遍历列表 ───
fruits = ["苹果", "香蕉", "橘子"]
for fruit in fruits:
    print(fruit)

# ─── range() 生成数字序列 ───
for i in range(5):         # 0,1,2,3,4
    print(i)

for i in range(2, 6):      # 2,3,4,5
    print(i)

for i in range(0, 10, 2):  # 0,2,4,6,8（步长为2）
    print(i)

# ─── 累加求和（典型考题） ───
total = 0
for i in range(1, 101):    # 1到100
    total += i
print(total)               # 5050
```

### while 循环

```python
count = 0
while count < 5:
    print(count)
    count += 1             # 别忘了更新条件！

# ─── break 与 continue ───
for i in range(10):
    if i == 3:
        continue           # 跳过3
    if i == 8:
        break              # 到8就停
    print(i)               # 输出：0,1,2,4,5,6,7
```

> **💡 考试重点**：`range(start, stop, step)` 三个参数的含义、`break` vs `continue`

## 0.8 函数

```python
# ─── 定义函数 ───
def add(a, b):
    """返回 a 和 b 的和"""   # 文档字符串（docstring）
    return a + b

result = add(3, 5)
print(result)              # 8

# ─── 默认参数 ───
def power(base, exp=2):    # exp 默认值为2
    return base ** exp

print(power(3))            # 9（3²）
print(power(3, 3))         # 27（3³）

# ─── 多个返回值 ───
def divide(a, b):
    quotient = a // b      # 整除
    remainder = a % b      # 取余
    return quotient, remainder

q, r = divide(17, 5)
print(q, r)                # 3 2
```

## 0.9 lambda 表达式

lambda 是**匿名函数**，适合简单操作。

```python
# ─── 基本语法：lambda 参数: 表达式 ───
double = lambda x: x * 2
print(double(5))           # 10

# ─── 与 sorted 结合使用（高频考点！） ───
students = [
    {"name": "张三", "score": 85},
    {"name": "李四", "score": 92},
    {"name": "王五", "score": 78}
]

# 按分数排序
sorted_students = sorted(students, key=lambda s: s["score"])
print(sorted_students)

# 按分数降序
sorted_students_desc = sorted(students, key=lambda s: s["score"], reverse=True)

# ─── 与 map/filter 结合 ───
numbers = [1, 2, 3, 4, 5]
squared = list(map(lambda x: x**2, numbers))         # [1,4,9,16,25]
evens = list(filter(lambda x: x % 2 == 0, numbers))  # [2,4]
```

> **💡 考试重点**：`lambda` 搭配 `sorted`/`map`/`filter` 是高频考点

## 0.10 列表推导式

用一行代码生成新列表，考试**必考**！

```python
# ─── 基本形式：[表达式 for 变量 in 可迭代对象] ───
squares = [x**2 for x in range(10)]
print(squares)   # [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

# ─── 带条件：[表达式 for 变量 in 可迭代对象 if 条件] ───
evens = [x for x in range(20) if x % 2 == 0]
print(evens)     # [0,2,4,6,8,10,12,14,16,18]

# ─── 等价于下面这段for循环 ───
evens2 = []
for x in range(20):
    if x % 2 == 0:
        evens2.append(x)

# ─── 实际应用：提取字典中的某个字段 ───
students = [
    {"name": "张三", "score": 85},
    {"name": "李四", "score": 92},
    {"name": "王五", "score": 78}
]
names = [s["name"] for s in students]
print(names)     # ['张三', '李四', '王五']

# 只取及格的分数
pass_scores = [s["score"] for s in students if s["score"] >= 80]
print(pass_scores)  # [85, 92]
```

## 0.11 文件读写

```python
# ─── 写入文件 ───
with open("test.txt", "w", encoding="utf-8") as f:
    f.write("姓名,成绩\n")
    f.write("张三,85\n")
    f.write("李四,92\n")
# with 语句会自动关闭文件，不用手动 f.close()

# ─── 读取文件 ───
with open("test.txt", "r", encoding="utf-8") as f:
    content = f.read()        # 全部读取
    print(content)

# ─── 按行读取 ───
with open("test.txt", "r", encoding="utf-8") as f:
    for line in f:
        print(line.strip())   # strip()去掉换行符

# ─── 读取到列表 ───
with open("test.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()
    print(lines)   # ['姓名,成绩\n', '张三,85\n', '李四,92\n']

# ─── 解析 CSV（手动方式） ───
with open("test.txt", "r", encoding="utf-8") as f:
    header = f.readline().strip().split(",")    # 读取标题行
    data = []
    for line in f:
        values = line.strip().split(",")
        data.append(values)
    print(header)  # ['姓名', '成绩']
    print(data)    # [['张三', '85'], ['李四', '92']]
```

> **💡 考试重点**：`with open()` 写法、`read/readline/readlines` 区别、`encoding="utf-8"`

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：列表和元组的根本区别是什么？**
> A：列表 `[]` 可修改（可变），元组 `()` 不可修改（不可变）。

**Q2：`dict["key"]` 和 `dict.get("key")` 有什么区别？**
> A：前者在 key 不存在时报 `KeyError`，后者返回 `None`（或指定的默认值），不报错。

**Q3：`break` 和 `continue` 的区别？**
> A：`break` 结束整个循环，`continue` 跳过本次循环继续下一次。

**Q4：列表推导式 `[x*2 for x in range(5) if x > 2]` 的结果是什么？**
> A：`[6, 8]`（x=3→6, x=4→8）

**Q5：`with open()` 语句的好处是什么？**
> A：自动管理文件关闭，即使发生异常也能正确关闭文件。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `IndexError: list index out of range` | 访问了超出列表长度的索引 | 检查列表长度 `len(lst)`，确保索引在范围内 |
| `TypeError: 'tuple' object does not support item assignment` | 试图修改元组元素 | 元组不可变，如需修改改为使用列表 |
| `KeyError: 'xxx'` | 访问字典中不存在的键 | 用 `dict.get(key)` 替代 `dict[key]` |
| `IndentationError` | 缩进不一致（混用空格和Tab） | 统一使用 4 个空格缩进 |
| `NameError: name 'xxx' is not defined` | 变量未定义就使用 | 确保变量已赋值后再使用 |

---

## 📝 本章小结

- ✅ 变量不需要类型声明，用 `type()` 查看类型
- ✅ 列表 `[]` 可变，元组 `()` 不可变，字典 `{}` 键值对
- ✅ 条件语句 `if/elif/else`，复合条件 `and/or/not`
- ✅ `for` 循环遍历，`range()` 生成数字序列，`break/continue` 控制流程
- ✅ 函数用 `def` 定义，支持默认参数和多返回值
- ✅ `lambda 参数: 表达式` 是匿名函数
- ✅ 列表推导式 `[表达式 for 变量 in 可迭代对象 if 条件]`
- ✅ 文件读写用 `with open(...) as f:`

## ➡️ 下一章预告

> 掌握 Python 基础后，下一章我们将进入 **NumPy**——数据分析的基石，学习如何高效处理大规模数值数组。
> [下一章：NumPy 数组操作](./01-numpy.md)
