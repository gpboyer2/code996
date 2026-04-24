#!/usr/bin/env bash

set -euo pipefail

version="${VERSION:-}"

if [ -z "$version" ]
then
    version=$(node -e "console.log(require('./package.json').version)")
fi

branch=$(git branch --show-current)
if [ -z "$branch" ]
then
    echo "当前不在普通分支上，无法创建发布 tag。"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]
then
    echo "当前存在未提交变更，GitHub Actions 只能构建已提交并推送到远端的代码。"
    echo "请先提交当前修改后再运行 npm run build-github。"
    exit 1
fi

tag_name="v$version"
if git rev-parse "$tag_name" >/dev/null 2>&1
then
    echo "本地已存在 tag：$tag_name"
    echo "请先升级 package.json 版本号，或手动处理旧 tag 后再运行。"
    exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag_name" >/dev/null 2>&1
then
    echo "远端已存在 tag：$tag_name"
    echo "请先升级 package.json 版本号，或手动处理远端旧 tag 后再运行。"
    exit 1
fi

git tag "$tag_name"
git push origin "$tag_name"

echo "已推送 tag，GitHub Actions 会自动触发 Release 构建。"
echo "tag：$tag_name"
echo "版本：$version"
